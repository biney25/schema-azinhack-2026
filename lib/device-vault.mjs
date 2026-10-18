import {newDataKey,wrapDataKey,unwrapDataKey,encryptDraft,decryptDraft} from './vault-crypto.mjs';
/** @type {Promise<any>} */
let queue=Promise.resolve();
const unlocked=new Map();
const vaultKey=owner=>'vault:'+owner;
const draftKey=(owner,id)=>'draft:'+owner+':'+id;
const lockedError=()=>new Error('Unlock this device before opening or changing drafts.');
/** @template T @param {()=>Promise<T>} operation @returns {Promise<T>} */
const serial=operation=>{const result=queue.catch(()=>{}).then(operation);queue=result;return result;};
async function database() {
    return new Promise((resolve,reject)=>{
        const open=indexedDB.open('schema-drafts',1);
        open.onupgradeneeded=()=>open.result.createObjectStore('drafts');
        open.onsuccess=()=>resolve(open.result);
        open.onerror=()=>reject(open.error);
        open.onblocked=()=>reject(new Error('Close older Schema tabs to open drafts.'));
    });
}
async function transaction(mode,work) {
    const db=await database();
    return new Promise((resolve,reject)=>{
        const tx=db.transaction('drafts',mode),store=tx.objectStore('drafts');let value,error;
        tx.oncomplete=()=>{db.close();resolve(value);};
        tx.onabort=()=>{db.close();reject(error??tx.error??new Error('Draft storage did not finish saving.'));};
        tx.onerror=()=>{};
        try{work(store,v=>value=v,e=>{error=e;tx.abort();});}catch(e){error=e;tx.abort();}
    });
}
const read=key=>transaction('readonly',(store,done)=>{const req=store.get(key);req.onsuccess=()=>done(req.result);});
async function ensure(owner) {
    let vault=await read(vaultKey(owner));
    if(vault)return vault;
    const {key}=await newDataKey();
    const proposed={mode:'device',keyId:crypto.randomUUID(),revision:1,deviceKey:key,autoLockMinutes:5};
    return transaction('readwrite',(store,done)=>{
        const req=store.get(vaultKey(owner));req.onsuccess=()=>{if(req.result)done(req.result);else{store.put(proposed,vaultKey(owner));done(proposed);}};
    });
}
function keyFor(vault) {
    if(vault.mode==='device')return vault.deviceKey;
    const active=unlocked.get(vault.keyId);if(!active)throw lockedError();return active;
}
async function commit(owner,old,next,puts=[],deletes=[]) {
    return transaction('readwrite',(store,done,abort)=>{
        const req=store.get(vaultKey(owner));req.onsuccess=()=>{
            if(req.result?.revision!==old.revision||req.result?.keyId!==old.keyId)return abort(new Error('Your drafts changed in another tab. Please retry.'));
            for(const [key,value]of puts)store.put(value,key);
            for(const key of deletes)store.delete(key);
            store.put({...next,revision:old.revision+1},vaultKey(owner));done(true);
        };
    });
}
async function rawDrafts(owner) {
    const prefix='draft:'+owner+':';
    return transaction('readonly',(store,done)=>{
        const rows=[];const req=store.openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
        req.onsuccess=()=>{const cursor=req.result;if(cursor){rows.push([cursor.key,cursor.value]);cursor.continue();}else{const legacy=store.get(owner);legacy.onsuccess=()=>{if(legacy.result?.id)rows.push([owner,legacy.result]);done(rows);};}};
    });
}
function notify(owner,kind) {
    if(typeof window==='undefined')return;
    window.dispatchEvent(new CustomEvent('schema-vault',{detail:{owner,kind}}));
    if('BroadcastChannel'in globalThis){const channel=new BroadcastChannel('schema-vault');channel.postMessage({owner,kind});channel.close();}
}
export async function vaultStatus(owner) {
    const vault=await ensure(owner);
    return {enabled:vault.mode==='passphrase',locked:vault.mode==='passphrase'&&!unlocked.has(vault.keyId),autoLockMinutes:vault.autoLockMinutes};
}
export async function unlockVault(owner,passphrase) {
    return serial(async()=>{const vault=await ensure(owner);if(vault.mode==='passphrase')unlocked.set(vault.keyId,await unwrapDataKey(owner,vault,passphrase));return vaultStatus(owner);});
}
export async function lockVault(owner,broadcast=true) {
    // Give active recording/editor handlers a chance to commit their last draft.
    const pending=[];
    if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('schema-before-lock',{detail:{owner,waitUntil:p=>pending.push(p)}}));
    await Promise.all(pending);await queue.catch(()=>{});
    await ensure(owner);unlocked.clear();
    if(broadcast)notify(owner,'lock');
}
const saves=new Map();
export function saveDraft(owner,value) {
    // Coalesce keystrokes per page while crypto/IndexedDB is busy; never queue
    // an unbounded copy of every photo for every character typed.
    const path=draftKey(owner,value.id);
    return new Promise((resolve,reject)=>{
        const waiting=saves.get(path);
        if(waiting){waiting.value=value;waiting.waiters.push({resolve,reject});return;}
        const request={value,waiters:[{resolve,reject}]};saves.set(path,request);
        serial(async()=>{
            while(request.value){
                const current=request.value,waiters=request.waiters;request.value=null;request.waiters=[];
                try{
                    const vault=await ensure(owner),key=keyFor(vault);
                    const draft={...current,savedAt:new Date().toISOString()};
                    const encrypted=await encryptDraft(key,owner,draft,vault.keyId);
                    await commit(owner,vault,vault,[[path,encrypted]]);
                    waiters.forEach(w=>w.resolve());
                }catch(error){waiters.forEach(w=>w.reject(error));}
            }
            saves.delete(path);
        }).catch(error=>{saves.delete(path);request.waiters.forEach(w=>w.reject(error));});
    });
}
export function removeDraft(owner,id) {return serial(async()=>{const vault=await ensure(owner);keyFor(vault);await commit(owner,vault,vault,[],[draftKey(owner,id)]);});}
export function listDrafts(owner) {
    return serial(async()=>{
        const vault=await ensure(owner),key=keyFor(vault),rows=await rawDrafts(owner),out=[],migrated=[];
        for(const [path,value]of rows){
            const id=path===owner?value.id:path.slice(('draft:'+owner+':').length);
            if(out.some(d=>d.id===id))continue;
            const draft=value.encrypted?await decryptDraft(key,owner,id,value):value;
            if(!out.some(d=>d.id===draft.id))out.push(draft);
            if(!value.encrypted && !rows.some(([k,v])=>k===draftKey(owner,id)&&v.encrypted))migrated.push([draftKey(owner,id),await encryptDraft(key,owner,draft,vault.keyId)]);
        }
        const obsolete=rows.some(([k])=>k===owner)?[owner]:[];
        if(migrated.length||obsolete.length)await commit(owner,vault,vault,migrated,obsolete);
        return out.sort((a,b)=>(b.savedAt??'').localeCompare(a.savedAt??''));
    });
}
export function clearDrafts(owner) {return serial(async()=>{const vault=await ensure(owner);keyFor(vault);const rows=await rawDrafts(owner);await commit(owner,vault,vault,[],rows.map(([k])=>k));});}
export function changeVaultPassphrase(owner,passphrase,autoLockMinutes=5) {
    return serial(async()=>{
        if(![1,5,15].includes(autoLockMinutes))throw new Error('Choose a supported lock timeout.');
        const vault=await ensure(owner),oldKey=keyFor(vault),rows=await rawDrafts(owner),{key,raw}=await newDataKey(),keyId=crypto.randomUUID();
        const next=passphrase?{mode:'passphrase',keyId,autoLockMinutes,...await wrapDataKey(owner,keyId,raw,passphrase)}:{mode:'device',keyId,autoLockMinutes,deviceKey:key};
        const puts=[],seen=new Set();
        for(const [path,value]of rows){const id=path===owner?value.id:path.slice(('draft:'+owner+':').length);if(seen.has(id))continue;seen.add(id);const draft=value.encrypted?await decryptDraft(oldKey,owner,id,value):value;puts.push([draftKey(owner,id),await encryptDraft(key,owner,draft,keyId)]);}
        await commit(owner,vault,next,puts,rows.some(([k])=>k===owner)?[owner]:[]);
        raw.fill(0);unlocked.delete(vault.keyId);if(passphrase)unlocked.set(keyId,key);
        notify(owner,'changed');return vaultStatus(owner);
    });
}
export function resetDeviceVault(owner,confirm) {
    if(confirm!=='DISCARD LOCAL DRAFTS')throw new Error('Confirm that you want to discard local drafts.');
    return serial(async()=>{const vault=await ensure(owner),rows=await rawDrafts(owner),{key}=await newDataKey();await commit(owner,vault,{mode:'device',keyId:crypto.randomUUID(),deviceKey:key,autoLockMinutes:5},[],rows.map(([k])=>k));unlocked.delete(vault.keyId);notify(owner,'changed');});
}
