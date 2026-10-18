import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {runWorker} from '../supabase/functions/schema-worker/handler.mjs';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
let db;
const alice=crypto.randomUUID(),bob=crypto.randomUUID(),aliceSession=crypto.randomUUID(),bobSession=crypto.randomUUID();
before(async()=>{
 db=new PGlite();await db.exec(`
 create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,is_anonymous boolean default false,banned_until timestamptz);
 create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz default now(),not_after timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 `);
 await db.exec(`create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
 grant usage on schema auth,public to anon,authenticated,service_role;grant execute on all functions in schema auth to authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
 alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
 `);
 const migration=readdirSync('supabase/migrations').find(f=>f.endsWith('_phase1_accounts_journal.sql'));await db.exec(readFileSync('supabase/migrations/'+migration,'utf8'));
 await db.exec(readFileSync('supabase/migrations/'+readdirSync('supabase/migrations').find(f=>f.endsWith('_phase1_background_jobs.sql')),'utf8'));
 for(const [id,session]of [[alice,aliceSession],[bob,bobSession]]){await db.query('insert into auth.users values($1,now(),false,null)',[id]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[session,id]);}
});
after(async()=>{await db?.close();});
async function as(user,session,fn){await db.exec('begin');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,session_id:session,role:'authenticated'})]);await db.exec('set local role authenticated');const result=await fn();await db.exec('commit');return result;}catch(error){await db.exec('rollback');throw error;}}
const api=(user,session,action,payload={})=>as(user,session,async()=>(await db.query('select public.schema_api($1,$2) result',[action,JSON.stringify(payload)])).rows[0].result);
const prefs={name:'A',theme:'rose',quiet:false,birthday:'',textSize:'standard',questionMode:'gentle',preferencesVersion:1,adultConfirmed:true,storageAcknowledged:true};
const page=(extra={})=>({id:crypto.randomUUID(),title:'A little memory',body:'Private words',date:'2026-09-29',mood:'peaceful',theme:'rose',layout:'collage',tags:[],people:[],place:'',blocks:[],assets:[],favorite:false,aiAllowed:false,...extra});
test('Postgres bootstrap and onboarding do not bundle AI or sharing consent',async()=>{
 const r=await api(alice,aliceSession,'bootstrap');assert.equal(r.profile.status,'active');assert.equal(r.profile.onboarded,false);
 await assert.rejects(()=>api(alice,aliceSession,'entries.save',page()),/welcome/);
 await assert.rejects(()=>api(alice,aliceSession,'profile.save',{...prefs,adultConfirmed:false}),/adult/);
 await api(alice,aliceSession,'profile.save',prefs);await api(bob,bobSession,'profile.save',prefs);
 const privacy=await api(alice,aliceSession,'privacy.get');assert.deepEqual(privacy.choices.map(x=>[x.purpose,x.enabled]),[['storage',true]]);
});
test('Postgres RPC and direct RLS reads isolate accounts; direct client writes cannot bypass rules',async()=>{
 const p=page();await api(alice,aliceSession,'entries.save',p);
 await assert.rejects(()=>api(bob,bobSession,'entries.get',{id:p.id}),/unavailable/);
 const otherRows=await as(bob,bobSession,()=>db.query('select * from public.schema_entries where id=$1',[p.id]));assert.equal(otherRows.rows.length,0);
 await assert.rejects(()=>as(alice,aliceSession,()=>db.query("update public.schema_profiles set plan='extra' where id=$1",[alice])),/permission denied/);
 await assert.rejects(()=>as(bob,bobSession,()=>db.query('insert into public.schema_entries(id,owner_id,title,date)values($1,$2,$3,$4)',[crypto.randomUUID(),alice,'Injected','2026-09-29'])),/permission denied/);
});
test('Postgres versions and create retry preserve the saved content',async()=>{
 const p=page();await api(alice,aliceSession,'entries.save',p);const retry=await api(alice,aliceSession,'entries.save',p);assert.equal(retry.entry.version,1);
 await api(alice,aliceSession,'entries.save',{...p,version:1,title:'Changed'});
 await assert.rejects(()=>api(alice,aliceSession,'entries.save',{...p,version:1}),/changed/);
 assert.equal((await api(alice,aliceSession,'entries.get',{id:p.id})).entry.title,'Changed');
});
test('Postgres consent has history and stale settings cannot overwrite newer preferences',async()=>{
 await api(alice,aliceSession,'privacy.set',{purpose:'ai',enabled:true,noticeVersion:'2026-09-29.1'});
 await assert.rejects(()=>api(alice,aliceSession,'profile.save',prefs),/preferences changed/);
 await api(alice,aliceSession,'privacy.set',{purpose:'ai',enabled:false,noticeVersion:'2026-09-29.1'});
 const r=await api(alice,aliceSession,'privacy.get');assert.equal(r.history.filter(x=>x.purpose==='ai').length,2);
 await assert.rejects(()=>api(alice,aliceSession,'privacy.set',{purpose:'imports',enabled:true,noticeVersion:'2026-09-29.1'}),/not connected/);
});
test('Postgres quota reservation, media ownership and private storage policies agree',async()=>{
 const id=crypto.randomUUID(),payload={id,name:'Photo',type:'image/jpeg',size:14,checksum:'a'.repeat(64)};
 const r=await api(alice,aliceSession,'media.reserve',payload);assert.equal(r.existing,false);
 await assert.rejects(()=>api(bob,bobSession,'media.reserve',payload),/another upload/);
 await assert.rejects(()=>as(bob,bobSession,()=>db.query('insert into storage.objects(bucket_id,name,metadata)values($1,$2,$3)',['schema-media',r.asset.key,JSON.stringify({size:14})])),/row-level security/);
 await assert.rejects(()=>as(alice,aliceSession,()=>db.query('insert into storage.objects(bucket_id,name,metadata)values($1,$2,$3)',['schema-media',r.asset.key,JSON.stringify({size:14})])),/row-level security/);
 // Privileged fixture represents the Edge uploader, after file-byte validation.
 await db.query('insert into storage.objects(bucket_id,name,metadata)values($1,$2,$3)',['schema-media',r.asset.key,JSON.stringify({size:14})]);
 await api(alice,aliceSession,'media.finalize',{id});assert.equal((await api(alice,aliceSession,'media.reserve',payload)).existing,true);
 assert.equal((await api(alice,aliceSession,'bootstrap')).profile.storage_bytes,14);
 await assert.rejects(()=>api(alice,aliceSession,'media.reserve',{...payload,checksum:'b'.repeat(64)}),/another upload/);
 await assert.rejects(()=>api(bob,bobSession,'entries.save',page({assets:[id]})),/file is unavailable/);
 const p=page({assets:[id]});await api(alice,aliceSession,'entries.save',p);await assert.rejects(()=>api(alice,aliceSession,'media.delete',{id}),/pages first/);
});
test('revoked session loses both RPC and direct row access even with old claims',async()=>{
 await db.query('delete from auth.sessions where id=$1',[bobSession]);
 await assert.rejects(()=>api(bob,bobSession,'bootstrap'),/Sign in again/);
 const r=await as(bob,bobSession,()=>db.query('select * from public.schema_profiles'));assert.equal(r.rows.length,0);
});
test('closing a journal requires recent authentication and immediately denies reads',async()=>{
 await db.query("update auth.sessions set created_at=now()-interval '1 hour' where id=$1",[aliceSession]);
 await assert.rejects(()=>api(alice,aliceSession,'account.close',{confirm:'DELETE'}),/Sign in again/);
 await db.query('update auth.sessions set created_at=now()where id=$1',[aliceSession]);
 await api(alice,aliceSession,'account.close',{confirm:'DELETE'});await assert.rejects(()=>api(alice,aliceSession,'entries.list'),/closed/);
 const status=await api(alice,aliceSession,'account.status');assert.equal(status.status,'deleting');assert.equal(status.job.state,'pending');assert.equal(status.job.lease_token,undefined);
 const rows=await as(alice,aliceSession,()=>db.query('select * from public.schema_entries'));assert.equal(rows.rows.length,0);
});

async function machine(action,payload={}){await db.exec('begin');try{await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({role:'service_role'})]);await db.exec('set local role service_role');const r=await db.query('select public.schema_worker($1,$2) result',[action,JSON.stringify(payload)]);await db.exec('commit');return r.rows[0].result;}catch(e){await db.exec('rollback');throw e;}}
test('worker facade denies customers and rejects old leases after recovery',async()=>{
 await assert.rejects(()=>as(alice,aliceSession,()=>db.query("select public.schema_worker('claim')")),/permission denied/);
 const old=await machine('claim');await db.query("update public.schema_jobs set lease_until=now()-interval '1 second' where id=$1",[old.id]);
 const current=await machine('claim');assert.equal(current.id,old.id);assert.notEqual(current.lease_token,old.lease_token);
 await assert.rejects(()=>machine('batch',{jobId:old.id,leaseToken:old.lease_token}),/Lease lost/);
 await machine('fail',{jobId:current.id,leaseToken:current.lease_token});
 await db.query('update public.schema_jobs set available_at=now()where id=$1',[old.id]);
});
test('real worker handler retries storage failure then erases blobs, rows and identity; token cannot replay',async()=>{
 let failStorage=true;const removed=[];
 const admin={rpc:async(name,{action,payload})=>{try{return {data:await machine(action,payload)}}catch(e){return {error:{code:e.code,message:e.message}}}},storage:{from:()=>({remove:async keys=>{if(failStorage)return {error:new Error('offline')};removed.push(...keys);await db.query('delete from storage.objects where name=any($1)',[keys]);return {error:null};}})},auth:{admin:{deleteUser:async id=>{await db.query('delete from auth.sessions where user_id=$1',[id]);await db.query('delete from auth.users where id=$1',[id]);return {error:null};}}}};
 async function dispatch(){const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await db.query("insert into schema_private.dispatch_tokens values(encode(sha256(convert_to($1,'UTF8')),'hex'),now()+interval '90 seconds')",[token]);const req=()=>new Request('https://worker.test',{method:'POST',body:JSON.stringify({token})});const r=await runWorker(req(),admin);assert.equal(r.status,200);assert.equal((await runWorker(req(),admin)).status,401);return r.json();}
 assert.equal((await dispatch()).failed,1);assert.equal((await db.query('select count(*) as n from public.schema_assets where owner_id=$1',[alice])).rows[0].n,1);
 failStorage=false;await db.query("update public.schema_jobs set available_at=now()where owner_id=$1",[alice]);assert.equal((await dispatch()).failed,0);
 assert.equal(removed.length,1);assert.equal((await db.query('select count(*) as n from auth.users where id=$1',[alice])).rows[0].n,0);
 assert.equal((await db.query('select status from public.schema_profiles where id=$1',[alice])).rows[0].status,'deleted');
 assert.equal((await db.query("select state from public.schema_jobs where owner_id=$1 and kind='account_erasure'",[alice])).rows[0].state,'succeeded');
 assert.equal((await db.query('select count(*) as n from public.schema_entries where owner_id=$1',[alice])).rows[0].n,0);
});
test('customer HTTP adapter reads the PostgreSQL calendar, export and private media through the same account boundary',async()=>{
 const {handleCustomer}=await import('../lib/customer/service.mjs');
 const owner=crypto.randomUUID(),session=crypto.randomUUID();await db.query('insert into auth.users values($1,now(),false,null)',[owner]);await db.query('insert into auth.sessions(id,user_id)values($1,$2)',[session,owner]);
 await api(owner,session,'profile.save',prefs);const p=page({people:['Friend'],tags:['college'],place:'Garden'});await api(owner,session,'entries.save',p);
 const client={auth:{getUser:async()=>({data:{user:{id:owner,email:'fixture@example.test',email_confirmed_at:'2026-09-29'}}})},rpc:async(name,{action,payload})=>{try{return {data:await api(owner,session,action,payload)}}catch(e){return {error:{code:e.code,message:e.message}}}}};
 const env={APP_ORIGIN:'https://schema.test'};const get=async path=>(await handleCustomer(new Request(env.APP_ORIGIN+'/api/'+path),path.split('?')[0].split('/'),client,env)).json();
 assert.equal((await get('calendar?month=2026-09')).entries[0].id,p.id);
 await api(owner,session,'collections');
 assert.equal((await get('collections')).people[0].name,'Friend');
 assert.equal((await get('recap?date=2026-09-29')).stats.pages,1);
 const summary=await get('export/summary');assert.equal(summary.pages,1);
 assert.equal((await get('export?exportRevision='+summary.revision)).entries[0].id,p.id);
 await api(owner,session,'entries.save',page());
 await assert.rejects(()=>get('export?exportRevision='+summary.revision),/changed during/);
 await assert.rejects(()=>get('assets/'+crypto.randomUUID()),/unavailable/);
 await assert.rejects(()=>handleCustomer(new Request(env.APP_ORIGIN+'/api/profile',{method:'PATCH',headers:{origin:'https://evil.test'},body:'{}'}),['profile'],client,env),/reload/);
});
