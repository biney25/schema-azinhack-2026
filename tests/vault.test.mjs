import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as vault from '../lib/device-vault.mjs';
import {newDataKey,encryptDraft,decryptDraft} from '../lib/vault-crypto.mjs';
const draft=(id=crypto.randomUUID())=>({id,title:'My private notebook',body:'An ordinary feeling worth remembering',date:'2026-09-29',pending:[{id:crypto.randomUUID(),name:'Notebook',type:'image/jpeg',blob:new Blob(['private-photo-bytes'],{type:'image/jpeg'})},{id:crypto.randomUUID(),name:'Voice',type:'audio/webm',blob:new Blob(['private-voice-bytes'],{type:'audio/webm'})}]});
async function raw(work){return new Promise((resolve,reject)=>{const open=indexedDB.open('schema-drafts',1);open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readwrite');let value;work(tx.objectStore('drafts'),v=>value=v);tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(tx.error);};};open.onerror=()=>reject(open.error);});}
const get=key=>raw((store,done)=>{const r=store.get(key);r.onsuccess=()=>done(r.result);});
const put=(key,value)=>raw(store=>store.put(value,key));

test('text, photo and audio drafts are encrypted at rest and round-trip intact',async()=>{
    const owner=crypto.randomUUID(),d=draft();await vault.saveDraft(owner,d);
    const record=await get('draft:'+owner+':'+d.id),key=await get('vault:'+owner);
    assert.equal(record.encrypted,1);assert.equal(record.title,undefined);assert.equal(record.pending,undefined);assert.equal(record.attachments.length,2);assert.equal(key.deviceKey.extractable,false);
    assert.ok(!new TextDecoder().decode(record.metadata.data).includes(d.title));
    const [saved]=await vault.listDrafts(owner);assert.equal(saved.body,d.body);assert.equal(await saved.pending[0].blob.text(),'private-photo-bytes');assert.equal(saved.pending[1].blob.type,'audio/webm');
});
test('passphrase survives reload; lock denies reads and edits; wrong passphrase never releases data',async()=>{
    const owner=crypto.randomUUID(),d=draft(),pass='four quiet lavender notebooks';await vault.saveDraft(owner,d);await vault.changeVaultPassphrase(owner,pass,1);
    const config=await get('vault:'+owner);assert.equal(config.deviceKey,undefined);assert.equal(config.mode,'passphrase');assert.equal(config.iterations,600000);
    const reloaded=await import('../lib/device-vault.mjs?reload='+crypto.randomUUID());
    assert.equal((await reloaded.vaultStatus(owner)).locked,true);await assert.rejects(()=>reloaded.listDrafts(owner),/Unlock/);await assert.rejects(()=>reloaded.unlockVault(owner,'incorrect long passphrase'),/did not unlock/);
    await reloaded.unlockVault(owner,pass);assert.equal((await reloaded.listDrafts(owner))[0].title,d.title);
    await reloaded.lockVault(owner);await assert.rejects(()=>reloaded.saveDraft(owner,d),/Unlock/);await assert.rejects(()=>reloaded.removeDraft(owner,d.id),/Unlock/);
});
test('passphrase rotation and removal preserve media and reject the old passphrase',async()=>{
    const owner=crypto.randomUUID(),d=draft();await vault.saveDraft(owner,d);await vault.changeVaultPassphrase(owner,'first remembered notebook');await vault.changeVaultPassphrase(owner,'second remembered notebook',15);await vault.lockVault(owner);
    await assert.rejects(()=>vault.unlockVault(owner,'first remembered notebook'),/did not unlock/);await vault.unlockVault(owner,'second remembered notebook');await vault.changeVaultPassphrase(owner,'');assert.equal((await vault.vaultStatus(owner)).enabled,false);assert.equal(await (await vault.listDrafts(owner))[0].pending[1].blob.text(),'private-voice-bytes');
});
test('migration removes legacy plaintext and never replaces a newer encrypted draft',async()=>{
    const owner=crypto.randomUUID(),d=draft();await vault.vaultStatus(owner);await put(owner,{...d,title:'Older legacy page'});await put('draft:'+owner+':'+d.id,d);
    assert.equal((await vault.listDrafts(owner))[0].title,d.title);assert.equal(await get(owner),undefined);assert.equal((await get('draft:'+owner+':'+d.id)).encrypted,1);
    await put(owner,{...d,title:'Stale plaintext'});await vault.changeVaultPassphrase(owner,'a sufficiently long passphrase');assert.equal((await vault.listDrafts(owner))[0].title,d.title);assert.equal(await get(owner),undefined);
    await put(owner,{...d,title:'Another stale copy'});await vault.listDrafts(owner);assert.equal(await get(owner),undefined);
});
test('ciphertext is bound to the account, draft and attachment position',async()=>{
    const {key}=await newDataKey(),d=draft(),record=await encryptDraft(key,'alice',d,'key-id');
    await assert.rejects(()=>decryptDraft(key,'bob',d.id,record));await assert.rejects(()=>decryptDraft(key,'alice','other-id',record));
    await assert.rejects(()=>decryptDraft(key,'alice',d.id,{...record,attachments:[...record.attachments].reverse()}));
    const corrupted=structuredClone(record);new Uint8Array(corrupted.metadata.data)[0]^=1;await assert.rejects(()=>decryptDraft(key,'alice',d.id,corrupted));
});
test('failed key migration keeps the existing records and configuration intact',async()=>{
    const owner=crypto.randomUUID(),d=draft();await vault.saveDraft(owner,d);const path='draft:'+owner+':'+d.id,corrupted=await get(path);new Uint8Array(corrupted.metadata.data)[0]^=1;await put(path,corrupted);const config=await get('vault:'+owner);
    await assert.rejects(()=>vault.changeVaultPassphrase(owner,'my new long passphrase'));assert.deepEqual(await get(path),corrupted);assert.equal((await get('vault:'+owner)).keyId,config.keyId);
});
test('local reset requires explicit confirmation and cannot delete another account drafts',async()=>{
    const owner=crypto.randomUUID(),other=crypto.randomUUID();await vault.saveDraft(owner,draft());await vault.saveDraft(other,draft());await vault.changeVaultPassphrase(owner,'my old forgotten passphrase');await vault.lockVault(owner);
    assert.throws(()=>vault.resetDeviceVault(owner,'yes'),/Confirm/);await vault.resetDeviceVault(owner,'DISCARD LOCAL DRAFTS');assert.equal((await vault.listDrafts(owner)).length,0);assert.equal((await vault.listDrafts(other)).length,1);
});
test('queued simultaneous draft saves keep every page',async()=>{
    const owner=crypto.randomUUID(),pages=Array.from({length:5},()=>draft());await Promise.all(pages.map(d=>vault.saveDraft(owner,d)));assert.equal((await vault.listDrafts(owner)).length,5);await vault.clearDrafts(owner);assert.equal((await vault.listDrafts(owner)).length,0);
});
test('rapid edits coalesce to the newest page without growing the write queue',async()=>{
    const owner=crypto.randomUUID(),d=draft();await Promise.all(Array.from({length:50},(_,i)=>vault.saveDraft(owner,{...d,body:'revision '+i})));
    assert.equal((await vault.listDrafts(owner))[0].body,'revision 49');
    // One coalesced write is sufficient when all calls arrive before crypto starts.
    assert.ok((await get('vault:'+owner)).revision<10);
});
