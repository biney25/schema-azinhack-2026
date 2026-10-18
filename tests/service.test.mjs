import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { handle, AppError, entrySchema } from '../lib/server/service.mjs';
function setup() {
    const sqlite = new DatabaseSync(':memory:');
    for (const f of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort())
        sqlite.exec(readFileSync('drizzle/' + f, 'utf8'));
    const db = {
        prepare(sql) {
            const q = sqlite.prepare(sql);
            return { bind(...args) {
                    return {
                        async first() { return q.get(...args) ?? null; },
                        async all() { return { results: q.all(...args) }; },
                        run() { const r = q.run(...args); return { meta: { changes: Number(r.changes) } }; }
                    };
                } };
        },
        async batch(ss) { sqlite.exec('BEGIN'); try {
            const out = [];
            for (const s of ss)
                out.push(s.run());
            sqlite.exec('COMMIT');
            return out;
        }
        catch (e) {
            sqlite.exec('ROLLBACK');
            throw e;
        } }
    };
    const blobs = new Map();
    const env = { DB: db, BUCKET: { async put(k, v) { blobs.set(k, v); }, async get(k) { return blobs.has(k) ? { body: blobs.get(k) } : null; }, async delete(keys) { for (const k of Array.isArray(keys) ? keys : [keys])
                blobs.delete(k); } } };
    for(const u of [alice,bob,eve]) sqlite.prepare("INSERT INTO profiles(id,email,name,onboarded,created_at) VALUES(?,?,?,1,?)").run(u.userId,u.email,u.fullName,new Date().toISOString());
    for(const u of [alice,bob,eve]) sqlite.prepare("INSERT INTO consent_choices(owner_id,purpose,enabled,notice_version,updated_at) VALUES(?,'sharing',1,'2026-09-29.1',?)").run(u.userId,new Date().toISOString());
    return { env, sqlite, blobs };
}
const alice = { userId: 'alice', email: 'alice@example.com', fullName: 'Alice' }, bob = { userId: 'bob', email: 'bob@example.com', fullName: 'Bob' }, eve = { userId: 'eve', email: 'eve@example.com', fullName: 'Eve' };
const entry = (values = {}) => ({ id: crypto.randomUUID(), title: 'A quiet day', body: 'A private thought about college', date: '2026-09-28', assets: [], ...values });
async function call(env, path, user = alice, method = 'GET', data, headers = {}) { const request = new Request('https://schema.test/api/' + path, { method, headers: { origin: 'https://schema.test', ...headers }, ...(data !== undefined ? { body: typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data) } : {}) }); const r = await handle(request, path.split('?')[0].split('/'), user, env); return r; }
const asJson = async (...args) => (await call(...args)).json();
const rejects = (fn, status) => assert.rejects(fn, e => e instanceof AppError && e.status === status);
test('anonymous and cross-site writes cannot access journal', async () => { const { env } = setup(); await rejects(() => call(env, 'bootstrap', null), 401); await rejects(() => call(env, 'entries', alice, 'POST', entry(), { origin: 'https://evil.test' }), 403); });
test('create, idempotent retry, validation, and cross-account isolation', async () => { const { env } = setup(); const e = entry(); await asJson(env, 'entries', alice, 'POST', e); await asJson(env, 'entries', alice, 'POST', e); assert.equal((await asJson(env, 'bootstrap')).stats.pages, 1); await rejects(() => call(env, 'entries/' + e.id, bob), 404); await rejects(() => call(env, 'entries/' + e.id, bob, 'DELETE'), 404); await rejects(() => call(env, 'entries', bob, 'POST', e), 409); assert.equal((await asJson(env, 'export', bob)).entries.length, 0); await rejects(() => call(env, 'entries', alice, 'POST', entry({ assets: [crypto.randomUUID()] })), 400); assert.equal(entrySchema.safeParse(entry({ date: '2026-02-30' })).success, false); });
test('optimistic versions preserve another device edit', async () => { const { env } = setup(); const e = entry(); await asJson(env, 'entries', alice, 'POST', e); const a = await asJson(env, 'entries', alice, 'PATCH', { ...e, version: 1, title: 'Updated' }); assert.equal(a.entry.version, 2); await rejects(() => call(env, 'entries', alice, 'PATCH', { ...e, version: 1 }), 409); assert.equal((await asJson(env, 'entries/' + e.id)).entry.title, 'Updated'); });
const jpg = new Uint8Array([255, 216, 255, 224, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
async function asset(env) { const id = crypto.randomUUID(); await call(env, 'assets', alice, 'POST', jpg, { 'content-type': 'image/jpeg', 'x-asset-id': id }); return id; }
test('uploads validate bytes, enforce quota, and keep account boundaries', async () => { const { env, sqlite, blobs } = setup(); const id = await asset(env); assert.equal(blobs.size, 1); await rejects(() => call(env, 'assets/' + id, bob), 404); await rejects(() => call(env, 'assets', alice, 'POST', jpg, { 'content-type': 'image/png', 'x-asset-id': crypto.randomUUID() }), 415); sqlite.prepare('UPDATE profiles SET storage_bytes=? WHERE id=?').run(2 * 1024 ** 3, 'alice'); await rejects(() => asset(env), 402); assert.equal(blobs.size, 1); });
test('postcards redact text and revoke media permissions', async () => { const { env } = setup(); const id = await asset(env); const e = entry({ assets: [id], place: 'Secret place' }); await asJson(env, 'entries', alice, 'POST', e); const s = await asJson(env, 'shares', alice, 'POST', { entryId: e.id, email: bob.email, days: 7 }); await call(env,'shares/'+s.id+'/accept',bob,'POST'); const inbox = await asJson(env, 'shares', bob); assert.equal(inbox.received[0].snapshot.body, ''); assert.equal(inbox.received[0].snapshot.place, ''); assert.equal((await call(env, 'assets/' + id, bob)).status, 200); await rejects(() => call(env, 'assets/' + id, eve), 404); await call(env, 'shares/' + s.id, alice, 'DELETE'); await rejects(() => call(env, 'assets/' + id, bob), 404); });
test('pending circle invitation is not permission; acceptance is identity bound', async () => { const { env } = setup(); const id = await asset(env), e = entry({ assets: [id] }); await asJson(env, 'entries', alice, 'POST', e); const c = await asJson(env, 'circles', alice, 'POST', { name: 'Our people' }); await call(env, 'circles/' + c.id + '/invite', alice, 'POST', { email: bob.email }); await call(env, 'shares', alice, 'POST', { entryId: e.id, circleId: c.id }); assert.equal((await asJson(env, 'shares', bob)).received.length, 0); await rejects(()=>call(env, 'circles/' + c.id + '/accept', eve, 'POST'),404); await rejects(() => call(env, 'assets/' + id, eve), 404); await call(env, 'circles/' + c.id + '/accept', bob, 'POST'); assert.equal((await asJson(env, 'shares', bob)).received.length, 1); await call(env, 'circles/' + c.id, bob, 'DELETE'); await rejects(() => call(env, 'assets/' + id, bob), 404); });
test('blocking a sender denies direct media access too', async () => { const { env } = setup(); const id = await asset(env), e = entry({ assets: [id] }); await call(env, 'entries', alice, 'POST', e); const s = await asJson(env, 'shares', alice, 'POST', { entryId: e.id, email: bob.email }); await call(env,'shares/'+s.id+'/accept',bob,'POST'); await call(env, 'report', bob, 'POST', { shareId: s.id, reason: 'Unwanted message', block: true }); assert.equal((await asJson(env, 'shares', bob)).received.length, 0); await rejects(() => call(env, 'assets/' + id, bob), 404); });
test('search filters are parameterized and literal', async () => { const { env } = setup(); await call(env, 'entries', alice, 'POST', entry()); await call(env, 'entries', bob, 'POST', entry({ title: 'Other account' })); assert.equal((await asJson(env, 'entries?q=college')).entries.length, 1); assert.equal((await asJson(env, 'entries?q=%25')).entries.length, 0); assert.equal((await asJson(env, "entries?q='+OR+1=1--")).entries.length, 0); });
test('AI is opt in and disabled without a provider', async () => { const { env } = setup(); await rejects(() => call(env, 'ask', alice, 'POST', { question: 'What happened?' }), 403); await call(env, 'profile', alice, 'PATCH', { name: 'Alice', theme: 'rose', birthday: '', quiet: false, aiConsent: true, onboarded: true, preferencesVersion:1 }); await rejects(() => call(env, 'ask', alice, 'POST', { question: 'What happened?' }), 503); });
test('deleting a page revokes its shares; account removes owned media', async () => { const { env, blobs } = setup(); const id = await asset(env), e = entry({ assets: [id] }); await call(env, 'entries', alice, 'POST', e); await call(env, 'shares', alice, 'POST', { entryId: e.id, email: bob.email }); await call(env, 'entries/' + e.id, alice, 'DELETE'); assert.equal((await asJson(env, 'shares', bob)).received.length, 0); let response = await asJson(env, 'account', alice, 'DELETE', { confirm: 'DELETE' }); assert.equal(response.remaining, true); response = await asJson(env, 'account', alice, 'DELETE', { confirm: 'DELETE' }); assert.equal(response.remaining, false); assert.equal(blobs.size, 0); });
test('concurrent upload retries do not remove a completed photo', async () => { const { env, blobs, sqlite } = setup(); await call(env, 'bootstrap'); const id = crypto.randomUUID(); const requests = await Promise.allSettled([call(env, 'assets', alice, 'POST', jpg, { 'content-type': 'image/jpeg', 'x-asset-id': id }), call(env, 'assets', alice, 'POST', jpg, { 'content-type': 'image/jpeg', 'x-asset-id': id })]); assert.ok(requests.some(r=>r.status==='fulfilled'));for(const r of requests)if(r.status==='rejected')assert.equal(r.reason.status,409); assert.equal(blobs.size, 1); assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes, jpg.length); assert.equal((await call(env, 'assets/' + id)).status, 200); });
test('failed uploads release capacity and do not create readable assets', async () => { const { env, sqlite } = setup(); env.BUCKET.put = async () => { throw new Error('storage unavailable'); }; await assert.rejects(() => asset(env)); assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes, 0); assert.equal(sqlite.prepare('SELECT count(*) AS n FROM assets').get().n, 0); });
test('expired sharing does not grant media permission', async () => { const { env, sqlite } = setup(); const id = await asset(env), e = entry({ assets: [id] }); await call(env, 'entries', alice, 'POST', e); const sh = await asJson(env, 'shares', alice, 'POST', { entryId: e.id, email: bob.email }); await call(env,'shares/'+sh.id+'/accept',bob,'POST'); sqlite.prepare('UPDATE shares SET expires_at=? WHERE id=?').run('2000-01-01', sh.id); await rejects(() => call(env, 'assets/' + id, bob), 404); });
test('deletion lock prevents new edits while cleanup is incomplete', async () => { const { env } = setup(); await asset(env); await call(env, 'account', alice, 'DELETE', { confirm: 'DELETE' }); await rejects(() => call(env, 'entries', alice, 'POST', entry()), 409); const state = await asJson(env, 'bootstrap'); assert.equal(state.profile.status, 'deleting'); });
test('untrusted webhook signatures cannot grant paid access', async () => { const { env } = setup(); env.RAZORPAY_WEBHOOK_SECRET = 'test-secret'; await rejects(() => call(env, 'billing/webhook', null, 'POST', {}, { 'x-razorpay-signature': '0'.repeat(64) }), 401); });

test('onboarding is enforced by the server and records an adult declaration', async () => {
    const {env,sqlite}=setup(), newcomer={userId:'new',email:'new@example.com'};
    await rejects(()=>call(env,'entries',newcomer,'POST',entry()),403);
    const profile={name:'New',theme:'rose',birthday:'',aiConsent:false,quiet:false,onboarded:true,preferencesVersion:1,storageAcknowledged:true};
    await rejects(()=>call(env,'profile',newcomer,'PATCH',profile),400);
    await rejects(()=>call(env,'profile',newcomer,'PATCH',{...profile,adultConfirmed:true,birthday:'2020-01-01'}),400);
    await call(env,'profile',newcomer,'PATCH',{...profile,adultConfirmed:true});
    await call(env,'entries',newcomer,'POST',entry());
    assert.equal(sqlite.prepare("SELECT count(*) n FROM audit WHERE owner_id=? AND action='Adult declaration accepted'").get('new').n,1);
});
test('concurrent file deletion releases capacity exactly once', async () => {
    const {env,sqlite}=setup();const first=await asset(env),second=await asset(env);
    await Promise.all([call(env,'assets/'+first,alice,'DELETE'),call(env,'assets/'+first,alice,'DELETE')]);
    assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes,jpg.length);
    assert.equal((await call(env,'assets/'+second)).status,200);
});
test('database rejects attaching deleting media and claiming linked media', async () => {
    const {env,sqlite}=setup();const id=await asset(env),e=entry({assets:[id]});
    await call(env,'entries',alice,'POST',e);
    assert.throws(()=>sqlite.prepare("UPDATE assets SET state='deleting' WHERE id=?").run(id),/asset_in_use/);
    await call(env,'entries/'+e.id,alice,'DELETE');
    sqlite.prepare("UPDATE assets SET state='deleting' WHERE id=?").run(id);
    await rejects(()=>call(env,'entries',alice,'POST',entry({assets:[id]})),400);
    assert.throws(()=>sqlite.prepare('INSERT INTO entries(id,owner_id,title,date,assets,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),'alice','Race','2026-09-28',JSON.stringify([id]),'now','now'),/entry_media_unavailable/);
});
test('deleting unused media revokes older snapshots containing it', async () => {
    const {env}=setup();const id=await asset(env),e=entry({assets:[id]});
    await call(env,'entries',alice,'POST',e);await call(env,'shares',alice,'POST',{entryId:e.id,email:bob.email});
    await call(env,'entries',alice,'PATCH',{...e,version:1,assets:[]});
    await call(env,'assets/'+id,alice,'DELETE');
    assert.equal((await asJson(env,'shares',bob)).received.length,0);
});
test('unfinished uploads can be reclaimed only after their safety window', async () => {
    const {env,sqlite}=setup();const id=await asset(env);
    sqlite.prepare("UPDATE assets SET state='pending' WHERE id=?").run(id);
    await rejects(()=>call(env,'assets/'+id,alice,'DELETE'),409);
    sqlite.prepare('UPDATE assets SET created_at=? WHERE id=?').run('2000-01-01',id);
    await call(env,'assets/'+id,alice,'DELETE');
    assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes,0);
});
test('circle owner receives member contributions and removing a member revokes contributions', async () => {
    const {env}=setup();const c=await asJson(env,'circles',alice,'POST',{name:'Close friends'});
    await call(env,'circles/'+c.id+'/invite',alice,'POST',{email:bob.email});await call(env,'circles/'+c.id+'/accept',bob,'POST');
    const e=entry();await call(env,'entries',bob,'POST',e);await call(env,'shares',bob,'POST',{entryId:e.id,circleId:c.id});
    assert.equal((await asJson(env,'shares',alice)).received.length,1);
    await rejects(()=>call(env,'circles/'+c.id+'/remove',bob,'POST',{email:alice.email}),403);
    await call(env,'circles/'+c.id+'/remove',alice,'POST',{email:bob.email});
    assert.equal((await asJson(env,'shares',alice)).received.length,0);
    await rejects(()=>call(env,'circles/'+c.id,bob),404);
});
test('deleted account cannot be resurrected by a late request', async () => {
    const {env,sqlite}=setup();await call(env,'account',alice,'DELETE',{confirm:'DELETE'});
    await rejects(()=>call(env,'entries',alice,'POST',entry()),410);
    const profile=sqlite.prepare('SELECT * FROM profiles WHERE id=?').get('alice');
    assert.equal(profile.status,'deleted');assert.equal(profile.email,'');assert.equal(profile.name,'');
});
test('storage cursor includes older files without leaking another account', async () => {
    const {env,sqlite}=setup();
    for(let i=0;i<61;i++)sqlite.prepare('INSERT INTO assets(id,owner_id,key,name,type,size,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),'alice','key-'+i,'File','image/jpeg',10,'now');
    const first=await asJson(env,'media'),second=await asJson(env,'media?after='+first.next);
    assert.equal(first.assets.length,50);assert.equal(second.assets.length,11);assert.equal(second.next,null);
    assert.equal((await asJson(env,'media',bob)).assets.length,0);
});

function billingSetup(){
    const fixture=setup(), subscriptions=new Map(),calls=[];
    Object.assign(fixture.env,{BILLING_ENABLED:'true',RAZORPAY_KEY_ID:'rzp_test_fixture',RAZORPAY_KEY_SECRET:'fixture-secret',RAZORPAY_WEBHOOK_SECRET:'fixture-webhook',RAZORPAY_PLAN_MONTHLY:'plan_month',RAZORPAY_PLAN_YEARLY:'plan_year'});
    fixture.env.BILLING_FETCH=async(url,options={})=>{
        const path=new URL(url).pathname.replace('/v1/','');calls.push({path,method:options.method});
        if(path.startsWith('plans/'))return Response.json({id:path.split('/')[1],period:path.endsWith('plan_month')?'monthly':'yearly',interval:1,item:{currency:'INR',amount:path.endsWith('plan_month')?9900:79900}});
        if(path==='subscriptions'&&options.method==='POST'){
            const input=JSON.parse(options.body),id='sub_test'+(subscriptions.size+1),s={id,plan_id:input.plan_id,status:'created',paid_count:0,current_end:null,notes:input.notes};subscriptions.set(id,s);return Response.json(s);
        }
        const id=path.split('/')[1],s=subscriptions.get(id);
        if(path.startsWith('invoices'))return Response.json({items:[]});
        if(!s)return Response.json({}, {status:404});
        if(path.endsWith('/cancel'))s.status='cancelled';
        return Response.json({...s});
    };
    return {...fixture,subscriptions,calls};
}
async function signedEvent(env,id,eventId='evt_test'){
    const payload=JSON.stringify({event:'subscription.charged',payload:{subscription:{entity:{id}}}});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RAZORPAY_WEBHOOK_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))),b=>b.toString(16).padStart(2,'0')).join('');
    return call(env,'billing/webhook',null,'POST',payload,{'x-razorpay-signature':signature,'x-razorpay-event-id':eventId});
}
test('concurrent and repeated checkout does not create duplicate subscriptions',async()=>{
    const {env,calls}=billingSetup();
    await Promise.allSettled([call(env,'billing/checkout',alice,'POST',{period:'monthly'}),call(env,'billing/checkout',alice,'POST',{period:'monthly'})]);
    const again=await asJson(env,'billing/checkout',alice,'POST',{period:'monthly'});
    assert.equal(again.subscriptionId,'sub_test1');assert.equal(calls.filter(c=>c.path==='subscriptions'&&c.method==='POST').length,1);
    await rejects(()=>call(env,'billing/checkout',alice,'POST',{period:'yearly'}),409);
});
test('ambiguous checkout failure is held for reconciliation without a second mandate',async()=>{
    const {env,sqlite}=billingSetup();let calls=0;const original=env.BILLING_FETCH;env.BILLING_FETCH=async(url,options)=>{if(url.includes('/plans/'))return original(url,options);calls++;throw new Error('timeout');};
    await rejects(()=>call(env,'billing/checkout',alice,'POST',{period:'monthly'}),503);
    await rejects(()=>call(env,'billing/checkout',alice,'POST',{period:'monthly'}),409);
    await rejects(()=>call(env,'account',alice,'DELETE',{confirm:'DELETE'}),409);
    assert.equal(calls,1);assert.equal(sqlite.prepare('SELECT state FROM billing_checkouts WHERE owner_id=?').get('alice').state,'creating');
});
test('signed webhook reconciles verified paid state once; cancellation preserves paid time',async()=>{
    const {env,subscriptions,sqlite,calls}=billingSetup();const checkout=await asJson(env,'billing/checkout',alice,'POST',{period:'monthly'});
    Object.assign(subscriptions.get(checkout.subscriptionId),{status:'active',paid_count:1,current_end:Math.floor(Date.now()/1000)+86400});
    await signedEvent(env,checkout.subscriptionId);const count=calls.length;await signedEvent(env,checkout.subscriptionId);assert.equal(calls.length,count);
    assert.equal((await asJson(env,'bootstrap')).profile.plan,'plus');
    await rejects(()=>call(env,'billing/cancel',bob,'POST',{id:checkout.subscriptionId,confirm:'CANCEL'}),404);
    await call(env,'billing/cancel',alice,'POST',{id:checkout.subscriptionId,confirm:'CANCEL'});
    assert.equal(subscriptions.get(checkout.subscriptionId).status,'cancelled');assert.equal((await asJson(env,'bootstrap')).profile.plan,'plus');
    sqlite.prepare('UPDATE subscriptions SET paid_until=?').run('2000-01-01');assert.equal((await asJson(env,'bootstrap')).profile.plan,'free');
});
test('unpaid authentication grants no allowance and invoices are ownership scoped',async()=>{
    const {env,subscriptions,calls}=billingSetup();const checkout=await asJson(env,'billing/checkout',alice,'POST',{period:'yearly'});
    Object.assign(subscriptions.get(checkout.subscriptionId),{status:'authenticated',paid_count:0,current_end:Math.floor(Date.now()/1000)+86400});
    await signedEvent(env,checkout.subscriptionId);assert.equal((await asJson(env,'bootstrap')).profile.plan,'free');
    const count=calls.length;await rejects(()=>call(env,'billing/invoices',bob,'POST',{id:checkout.subscriptionId}),404);assert.equal(calls.length,count);
});
test('older subscription events cannot revoke a different paid subscription',async()=>{
    const {env,sqlite,subscriptions}=billingSetup();
    const old=await asJson(env,'billing/checkout',alice,'POST',{period:'monthly'});await call(env,'billing/cancel',alice,'POST',{id:old.subscriptionId,confirm:'CANCEL'});
    const newer=await asJson(env,'billing/checkout',alice,'POST',{period:'yearly'});Object.assign(subscriptions.get(newer.subscriptionId),{status:'active',paid_count:1,current_end:Math.floor(Date.now()/1000)+86400});
    await signedEvent(env,newer.subscriptionId,'evt_new');await signedEvent(env,old.subscriptionId,'evt_old');
    assert.equal((await asJson(env,'bootstrap')).profile.plan,'plus');assert.equal(sqlite.prepare('SELECT count(*) n FROM subscriptions').get().n,2);
});

test('direct postcards require identity-bound acceptance before content or media access',async()=>{
    const {env}=setup();const id=await asset(env),e=entry({assets:[id],title:'Private title'});
    await call(env,'entries',alice,'POST',e);const s=await asJson(env,'shares',alice,'POST',{entryId:e.id,email:bob.email});
    const before=await asJson(env,'shares',bob);assert.equal(before.received.length,0);assert.equal(before.invitations.length,1);assert.equal(before.invitations[0].title,undefined);assert.equal(before.invitations[0].snapshot,undefined);
    await rejects(()=>call(env,'assets/'+id,bob),404);await rejects(()=>call(env,'shares/'+s.id+'/accept',eve,'POST'),404);
    await call(env,'shares/'+s.id+'/accept',bob,'POST');assert.equal((await call(env,'assets/'+id,bob)).status,200);
    const replacement={userId:'replacement',email:bob.email};await rejects(()=>call(env,'assets/'+id,replacement),404);
});
test('declining a direct invitation deletes the grant without exposing content',async()=>{
    const {env}=setup();const e=entry();await call(env,'entries',alice,'POST',e);
    const s=await asJson(env,'shares',alice,'POST',{entryId:e.id,email:bob.email});await call(env,'shares/'+s.id+'/decline',bob,'POST');
    assert.equal((await asJson(env,'shares',bob)).invitations.length,0);await rejects(()=>call(env,'shares/'+s.id+'/accept',bob,'POST'),404);
});
test('blocking also stops new direct postcards and circle invitations',async()=>{
    const {env}=setup();const e=entry();await call(env,'entries',alice,'POST',e);const s=await asJson(env,'shares',alice,'POST',{entryId:e.id,email:bob.email});
    await call(env,'shares/'+s.id+'/accept',bob,'POST');await call(env,'report',bob,'POST',{shareId:s.id,reason:'Unwanted',block:true});
    await rejects(()=>call(env,'shares',alice,'POST',{entryId:e.id,email:bob.email}),403);
    const c=await asJson(env,'circles',alice,'POST',{name:'Circle'});await rejects(()=>call(env,'circles/'+c.id+'/invite',alice,'POST',{email:bob.email}),403);
});

test('checkout refuses a configured plan whose price differs from the UI',async()=>{
    const {env,calls}=billingSetup(),original=env.BILLING_FETCH;
    env.BILLING_FETCH=async(url,options)=>url.includes('/plans/')?Response.json({id:'plan_month',period:'monthly',interval:1,item:{currency:'INR',amount:99900}}):original(url,options);
    await rejects(()=>call(env,'billing/checkout',alice,'POST',{period:'monthly'}),503);
    assert.equal(calls.filter(c=>c.method==='POST').length,0);
});

// Portable archives exercise the real API handler and extract the produced ZIP.
async function exportHelpers(env, user=alice) {
    const {buildJournalArchive}=await import('../lib/journal-export.mjs');
    const {ZipReader,BlobReader,TextWriter,Uint8ArrayWriter}=await import('@zip.js/zip.js');
    const request=async (url,init={})=>{
        init.signal?.throwIfAborted();
        try { return await call(env,String(url).replace('/api/',''),user); }
        catch(e) { if(e instanceof AppError) return Response.json({error:e.message},{status:e.status}); throw e; }
    };
    async function unpack(blob) {
        const reader=new ZipReader(new BlobReader(blob),{useWebWorkers:false});
        const files=new Map((await reader.getEntries()).map(e=>[e.filename,e]));
        return {files,text:async name=>files.get(name).getData(new TextWriter()),bytes:async name=>files.get(name).getData(new Uint8ArrayWriter()),close:()=>reader.close()};
    }
    return {buildJournalArchive,request,unpack};
}
function recordingSink() {
    const state={chunks:[],closed:false,aborted:false};
    state.destination=new WritableStream({write(c){state.chunks.push(c.slice());},close(){state.closed=true;},abort(){state.aborted=true;}});
    return state;
}
test('portable ZIP crosses both cursors, includes unused media/audio, and escapes diary HTML',async()=>{
    const {env,sqlite,blobs}=setup();
    const hostile='<img src="https://tracker.invalid" onerror="alert(1)"> & memories';
    const ids=[];
    for(let i=0;i<102;i++) {
        const id=crypto.randomUUID();ids.push(id);
        const type=i===0?'audio/ogg':'image/jpeg';
        sqlite.prepare("INSERT INTO assets(id,owner_id,key,name,type,size,state,created_at) VALUES(?,?,?,?,?,?,'ready',?)").run(id,'alice','alice/'+id,i===0?'../voice.ogg':'photo.jpg',type,jpg.length,'2026-09-28');
        blobs.set('alice/'+id,jpg);
    }
    for(let i=0;i<103;i++) sqlite.prepare('INSERT INTO entries(id,owner_id,title,body,date,assets,blocks,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),'alice',i===0?hostile:'Page '+i,hostile,'2026-09-28',JSON.stringify(i===0?[ids[0],ids[1]]:[]),JSON.stringify([{text:hostile}]),'2026-09-28','2026-09-28');
    await call(env,'entries',bob,'POST',entry({title:'BOB SECRET'}));
    const h=await exportHelpers(env), result=await h.buildJournalArchive({request:h.request});
    const zip=await h.unpack(result.blob), manifest=JSON.parse(await zip.text('manifest.json'));
    assert.equal(manifest.pages,103);assert.equal(manifest.includedFiles,102);assert.equal(manifest.mediaParts.length,2);assert.equal(manifest.pageParts.length,2);
    const inventories=(await Promise.all(manifest.mediaParts.map(async p=>JSON.parse(await zip.text(p))))).flat();
    const voice=inventories.find(a=>a.id===ids[0]);assert.equal(voice.path,'media/'+ids[0]+'.ogg');
    assert.deepEqual(await zip.bytes(voice.path),jpg);
    assert.equal(voice.sha256,Buffer.from(await crypto.subtle.digest('SHA-256',jpg)).toString('hex'));
    const pages=(await Promise.all(manifest.pageParts.map(async p=>JSON.parse(await zip.text(p))))).flat();
    const first=pages.find(p=>p.title===hostile), html=await zip.text('pages/'+first.id+'.html');
    assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src="https://'));assert.ok(html.includes('<audio controls'));assert.ok(html.includes('../media/'+ids[1]+'.jpg'));
    assert.equal(pages.some(p=>p.title==='BOB SECRET'),false);
    assert.equal(inventories.some(a=>'key' in a || 'owner_id' in a),false);
    assert.ok([...zip.files.keys()].every(p=>!p.includes('..')&&!p.startsWith('/')));
    await zip.close();
});
test('archive revisions track journal changes, preserve read stability, and bind the account',async()=>{
    const {env}=setup();const start=await asJson(env,'export/summary');
    await asJson(env,'bootstrap');assert.equal((await asJson(env,'export/summary')).revision,start.revision);
    await call(env,'entries',bob,'POST',entry());assert.equal((await asJson(env,'export/summary')).revision,start.revision);
    await rejects(()=>call(env,'export?exportRevision='+encodeURIComponent(start.revision),bob),409);
    await call(env,'entries',alice,'POST',entry());
    await rejects(()=>call(env,'export?exportRevision='+encodeURIComponent(start.revision)),409);
    const v2=await asJson(env,'export/summary');await asset(env);
    await rejects(()=>call(env,'export/media?exportRevision='+encodeURIComponent(v2.revision)),409);
    const v3=await asJson(env,'export/summary');
    await call(env,'profile',alice,'PATCH',{name:'New name',theme:'rose',birthday:'',aiConsent:false,quiet:false,onboarded:true,preferencesVersion:1,storageAcknowledged:true});
    await rejects(()=>call(env,'export/summary?exportRevision='+encodeURIComponent(v3.revision)),409);
});
test('accepted sharing does not grant export access to somebody else’s media',async()=>{
    const {env}=setup(),id=await asset(env),e=entry({assets:[id]});await call(env,'entries',alice,'POST',e);
    const share=await asJson(env,'shares',alice,'POST',{entryId:e.id,email:bob.email});await call(env,'shares/'+share.id+'/accept',bob,'POST');
    assert.equal((await call(env,'assets/'+id,bob)).status,200);
    const summary=await asJson(env,'export/summary',bob);
    await rejects(()=>call(env,'assets/'+id+'?exportRevision='+encodeURIComponent(summary.revision),bob),404);
    assert.equal((await asJson(env,'export/media',bob)).assets.length,0);
});
test('streamed download commits only after revision validation; changed journal aborts it',async()=>{
    const {env}=setup();await asset(env);const h=await exportHelpers(env),out=recordingSink();
    let summaryReads=0;
    const request=async(url,init)=>{
        if(url.startsWith('/api/export/summary') && ++summaryReads===2) await call(env,'entries',alice,'POST',entry());
        return h.request(url,init);
    };
    await assert.rejects(h.buildJournalArchive({request,destination:out.destination}),/changed during/);
    assert.equal(out.closed,false);assert.equal(out.aborted,true);assert.ok(out.chunks.length>0);
    const good=recordingSink(),result=await h.buildJournalArchive({request:h.request,destination:good.destination});
    assert.equal(result.blob,null);assert.equal(good.closed,true);assert.equal(good.aborted,false);
    const zip=await h.unpack(new Blob(good.chunks));assert.equal(JSON.parse(await zip.text('manifest.json')).includedFiles,1);await zip.close();
});
test('truncated/missing media and cancellation never commit a file',async()=>{
    for(const mode of ['truncated','missing','cancel']) {
        const {env,blobs}=setup(),id=await asset(env),h=await exportHelpers(env),out=recordingSink(),abort=new AbortController();
        if(mode==='missing') blobs.delete('alice/'+id);
        const request=async(url,init)=>{
            const r=await h.request(url,init);
            if(url.startsWith('/api/assets/') && mode==='truncated') return new Response(jpg.slice(0,3),{headers:{'content-type':'image/jpeg'}});
            if(url.startsWith('/api/assets/') && mode==='cancel') abort.abort();
            return r;
        };
        await assert.rejects(h.buildJournalArchive({request,destination:out.destination,signal:abort.signal}));
        assert.equal(out.closed,false);assert.equal(out.aborted,true);
    }
});
test('pages-only explicitly omits media; unfinished uploads remain in the inventory',async()=>{
    const {env,sqlite}=setup(),id=await asset(env);await call(env,'entries',alice,'POST',entry({assets:[id]}));
    const pending=crypto.randomUUID();sqlite.prepare("INSERT INTO assets(id,owner_id,key,name,type,size,state,created_at) VALUES(?,?,?,?,?,?,'pending',?)").run(pending,'alice','alice/'+pending,'waiting.jpg','image/jpeg',14,'2026-09-28');
    const h=await exportHelpers(env),result=await h.buildJournalArchive({request:h.request,includeMedia:false}),zip=await h.unpack(result.blob);
    assert.equal(result.manifest.includedFiles,0);assert.equal(result.manifest.unfinishedFiles,1);assert.equal(result.manifest.storedFiles,1);
    assert.ok([...zip.files.keys()].every(p=>!p.startsWith('media/')));
    const inventory=JSON.parse(await zip.text(result.manifest.mediaParts[0]));assert.equal(inventory.find(a=>a.id===pending).state,'pending');
    assert.ok((await zip.text('index.html')).includes('Pages-only download'));await zip.close();
});
test('memory ceiling is enforced before reading media and again on actual output',async()=>{
    const {env}=setup();await asset(env);const h=await exportHelpers(env);let mediaReads=0;
    const request=async(url,init)=>{if(url.startsWith('/api/assets/'))mediaReads++;return h.request(url,init);};
    await assert.rejects(h.buildJournalArchive({request,maxBytes:100}),/too large/);assert.equal(mediaReads,0);
    const underestimate=async(url,init)=>{const r=await h.request(url,init);if(url.startsWith('/api/export/summary')){const data=await r.json();return Response.json({...data,estimatedBytes:0});}return r;};
    await assert.rejects(h.buildJournalArchive({request:underestimate,maxBytes:100}),/memory limit/);
});

const privacyChoice=(purpose,enabled)=>({purpose,enabled,noticeVersion:'2026-09-29.1'});
const preferences=(extra={})=>({name:'Alice',theme:'rose',birthday:'',quiet:false,aiConsent:false,onboarded:true,preferencesVersion:1,...extra});
test('privacy choices have separate opt-ins, bounded owner-only history and enforced withdrawal',async()=>{
    const {env,sqlite}=setup();
    await rejects(()=>call(env,'privacy',alice,'PATCH',privacyChoice('imports',true)),409);
    await rejects(()=>call(env,'privacy',alice,'PATCH',{...privacyChoice('ai',true),noticeVersion:'outdated'}),400);
    await call(env,'privacy',alice,'PATCH',privacyChoice('ai',true));
    await call(env,'privacy',alice,'PATCH',privacyChoice('ai',true));
    let state=await asJson(env,'privacy');assert.equal(state.history.filter(h=>h.purpose==='ai').length,1);assert.equal(state.choices.find(c=>c.purpose==='imports').enabled,false);
    assert.equal((await asJson(env,'privacy',bob)).history.length,0);
    await call(env,'privacy',alice,'PATCH',privacyChoice('ai',false));
    state=await asJson(env,'privacy');assert.equal(state.history.length,2);assert.equal(sqlite.prepare('SELECT ai_consent FROM profiles WHERE id=?').get('alice').ai_consent,0);
    await rejects(()=>call(env,'ask',alice,'POST',{question:'Remember today?'}),403);
});
test('sharing is opt-in and withdrawal revokes both postcards and late database writes',async()=>{
    const {env,sqlite}=setup(),e=entry();await call(env,'entries',alice,'POST',e);
    sqlite.prepare("DELETE FROM consent_choices WHERE owner_id='alice' AND purpose='sharing'").run();
    await rejects(()=>call(env,'shares',alice,'POST',{entryId:e.id,email:bob.email}),403);
    await call(env,'privacy',alice,'PATCH',privacyChoice('sharing',true));
    await call(env,'shares',alice,'POST',{entryId:e.id,email:bob.email});
    await call(env,'privacy',alice,'PATCH',privacyChoice('sharing',false));
    assert.equal(sqlite.prepare("SELECT count(*) n FROM shares WHERE owner_id='alice'").get().n,0);
    assert.throws(()=>sqlite.prepare("INSERT INTO shares(id,owner_id,entry_id,snapshot,expires_at,created_at) VALUES(?,?,?,?,?,?)").run(crypto.randomUUID(),'alice',e.id,'{}','2099-01-01','now'),/sharing_not_allowed/);
});
test('stale profile edits cannot re-enable AI or overwrite newer accessibility choices',async()=>{
    const {env,sqlite}=setup();await call(env,'profile',alice,'PATCH',preferences({textSize:'large',questionMode:'off',quiet:true}));
    await rejects(()=>call(env,'profile',alice,'PATCH',preferences({aiConsent:true})),409);
    assert.equal(sqlite.prepare('SELECT text_size FROM profiles WHERE id=?').get('alice').text_size,'large');
    assert.equal((await asJson(env,'privacy')).history.some(h=>h.purpose==='ai'&&h.enabled),false);
    await call(env,'privacy',alice,'PATCH',privacyChoice('ai',true));
    await rejects(()=>call(env,'profile',alice,'PATCH',preferences({preferencesVersion:2})),409);
});
test('first welcome records storage/adult choice and completes without bundling optional consent',async()=>{
    const {env,sqlite}=setup(),newcomer={userId:'new-welcome',email:'welcome@example.com'};
    await rejects(()=>call(env,'profile',newcomer,'PATCH',preferences({adultConfirmed:true})),400);
    await call(env,'profile',newcomer,'PATCH',preferences({name:'New',adultConfirmed:true,storageAcknowledged:true,theme:'lavender'}));
    let p=(await asJson(env,'bootstrap',newcomer)).profile;assert.equal(p.onboarding_step,'first_page');assert.equal(p.theme,'lavender');
    const choices=(await asJson(env,'privacy',newcomer)).choices;assert.equal(choices.find(c=>c.purpose==='storage').recorded,true);assert.ok(choices.filter(c=>c.purpose!=='storage').every(c=>!c.enabled));
    await call(env,'onboarding/complete',newcomer,'POST',{});p=(await asJson(env,'bootstrap',newcomer)).profile;assert.equal(p.onboarding_step,'done');
    assert.equal(sqlite.prepare("SELECT count(*) n FROM audit WHERE owner_id=? AND action='Adult declaration accepted'").get(newcomer.userId).n,1);
});
test('upload retries are byte-bound and never charge quota twice',async()=>{
    const {env,sqlite}=setup(),id=await asset(env),headers={'content-type':'image/jpeg','x-asset-id':id};
    const retry=await asJson(env,'assets',alice,'POST',jpg,headers);assert.match(retry.asset.checksum,/^[0-9a-f]{64}$/);assert.equal(retry.asset.key,undefined);
    const changed=jpg.slice();changed[12]=99;await rejects(()=>call(env,'assets',alice,'POST',changed,headers),409);
    await rejects(()=>call(env,'assets',bob,'POST',jpg,headers),409);
    assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes,jpg.length);
    sqlite.prepare('UPDATE assets SET checksum=NULL WHERE id=?').run(id);await call(env,'assets',alice,'POST',jpg,headers);await rejects(()=>call(env,'assets',alice,'POST',changed,headers),409);
});
test('retry while upload is pending cannot delete the original object or reservation',async()=>{
    const {env,sqlite,blobs}=setup(),id=crypto.randomUUID(),headers={'content-type':'image/jpeg','x-asset-id':id};
    let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),put=env.BUCKET.put;
    env.BUCKET.put=async(...args)=>{entered();await gate;return put(...args);};
    const first=call(env,'assets',alice,'POST',jpg,headers);await started;await rejects(()=>call(env,'assets',alice,'POST',jpg,headers),409);release();await first;
    assert.equal(blobs.size,1);assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes,jpg.length);
});
test('erasure is resumable, idempotent, owner-isolated and immediately hides journal content',async()=>{
    const {requestErasure,runErasure}=await import('../lib/server/jobs.mjs');const {env,sqlite,blobs}=setup();const id=await asset(env),e=entry({assets:[id]});await call(env,'entries',alice,'POST',e);await call(env,'entries',bob,'POST',entry());
    await Promise.all([requestErasure(env.DB,'alice'),requestErasure(env.DB,'alice')]);assert.equal(sqlite.prepare('SELECT count(*) n FROM jobs').get().n,1);
    assert.equal((await asJson(env,'bootstrap')).entries.length,0);await rejects(()=>call(env,'assets/'+id,alice),409);assert.equal((await asJson(env,'account/status',bob)).job,null);
    const first=await runErasure(env,'alice');assert.equal(first.remaining,true);assert.equal(blobs.size,0);
    const last=await runErasure(env,'alice');assert.equal(last.remaining,false);assert.equal((await runErasure(env,'alice')).remaining,false);assert.equal(sqlite.prepare('SELECT status FROM profiles WHERE id=?').get('alice').status,'deleted');
    assert.equal((await asJson(env,'bootstrap',bob)).entries.length,1);assert.equal((await asJson(env,'account/status')).job.state,'succeeded');
});
test('failed erasure retains metadata and capacity, backs off and stops at its retry budget',async()=>{
    const {requestErasure,runErasure}=await import('../lib/server/jobs.mjs');const {env,sqlite}=setup();await asset(env);await requestErasure(env.DB,'alice');env.BUCKET.delete=async()=>{throw new Error('private provider response');};
    const base=Date.now()+1000;
    for(let i=0;i<5;i++)await rejects(()=>runErasure(env,'alice',{now:new Date(base+i*600000)}),503);
    const job=sqlite.prepare('SELECT * FROM jobs').get();assert.equal(job.state,'failed');assert.equal(job.attempts,5);assert.equal(job.error_code,'storage_or_database_failure');assert.equal(JSON.stringify(job).includes('private provider response'),false);
    assert.equal(sqlite.prepare('SELECT count(*) n FROM assets').get().n,1);assert.equal(sqlite.prepare('SELECT storage_bytes FROM profiles WHERE id=?').get('alice').storage_bytes,jpg.length);
});
test('a live deletion lease excludes a second worker and an expired lease is recoverable',async()=>{
    const {requestErasure,runErasure}=await import('../lib/server/jobs.mjs');const {env,sqlite}=setup();await asset(env);await requestErasure(env.DB,'alice');let entered,release;const started=new Promise(r=>entered=r),gate=new Promise(r=>release=r),del=env.BUCKET.delete;
    env.BUCKET.delete=async keys=>{entered();await gate;return del(keys);};const first=runErasure(env,'alice');await started;const token=sqlite.prepare('SELECT lease_token FROM jobs').get().lease_token;await runErasure(env,'alice');assert.equal(sqlite.prepare('SELECT lease_token FROM jobs').get().lease_token,token);release();await first;
    sqlite.prepare("UPDATE jobs SET state='running',lease_token='crashed-worker',lease_until='2000-01-01',attempts=1").run();assert.equal((await runErasure(env,'alice')).remaining,false);
});
test('stale erasure worker cannot complete metadata after losing its lease',async()=>{
    const {requestErasure,runErasure}=await import('../lib/server/jobs.mjs');const {env,sqlite}=setup();await asset(env);await requestErasure(env.DB,'alice');env.BUCKET.delete=async()=>{sqlite.prepare("UPDATE jobs SET lease_token='newer-worker'").run();};
    await runErasure(env,'alice');assert.equal(sqlite.prepare('SELECT count(*) n FROM assets').get().n,1);assert.equal(sqlite.prepare('SELECT state FROM jobs').get().state,'running');assert.equal(sqlite.prepare('SELECT lease_token FROM jobs').get().lease_token,'newer-worker');
});
test('scheduler adapter processes only due erasure jobs and bounds each sweep',async()=>{
    const {requestErasure,runDueErasureJobs}=await import('../lib/server/jobs.mjs');const {env,sqlite}=setup();await requestErasure(env.DB,'alice');await requestErasure(env.DB,'bob');
    const result=await runDueErasureJobs(env,{limit:1,now:new Date(Date.now()+1000)});assert.equal(result.examined,1);assert.equal(result.completed,1);assert.equal(sqlite.prepare("SELECT count(*) n FROM jobs WHERE state='pending'").get().n,1);
    await assert.rejects(()=>runDueErasureJobs(env,{limit:500}));
});
