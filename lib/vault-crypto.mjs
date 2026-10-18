const encoder = new TextEncoder();
const context = (owner, id, part) => encoder.encode(JSON.stringify(['schema-draft-v1',owner,id,part]));
export const KDF_ITERATIONS = 600000;
const random = n => crypto.getRandomValues(new Uint8Array(n));
export async function newDataKey() {
    const raw=random(32);
    return {raw,key:await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])};
}
async function wrappingKey(passphrase,salt) {
    if(typeof passphrase!=='string' || passphrase.length<12 || passphrase.length>256) throw new Error('Use a device passphrase with 12–256 characters.');
    const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
    return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:KDF_ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function wrapDataKey(owner,id,raw,passphrase) {
    const salt=random(16),iv=random(12),key=await wrappingKey(passphrase,salt);
    return {salt,iv,iterations:KDF_ITERATIONS,wrapped:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context(owner,id,'key')},key,raw)};
}
export async function unwrapDataKey(owner,vault,passphrase) {
    if(vault.iterations!==KDF_ITERATIONS) throw new Error('This device lock version is not supported.');
    try {
        const key=await wrappingKey(passphrase,vault.salt);
        const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:vault.iv,additionalData:context(owner,vault.keyId,'key')},key,vault.wrapped);
        return await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
    } catch { throw new Error('That device passphrase did not unlock your drafts.'); }
}
async function encrypt(key,owner,id,part,data) {
    const iv=random(12);
    return {iv,data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:context(owner,id,part)},key,data)};
}
async function decrypt(key,owner,id,part,record) {
    return crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv,additionalData:context(owner,id,part)},key,record.data);
}
export async function encryptDraft(key,owner,draft,keyId) {
    const attachments=[];
    const pending=[];
    for(const p of draft.pending??[]) {
        const {blob,url,...metadata}=p;
        if(!(blob instanceof Blob)) throw new Error('A draft attachment is unavailable. Keep this page open and save it again.');
        attachments.push(await encrypt(key,owner,draft.id,'attachment:'+attachments.length,await blob.arrayBuffer()));
        pending.push({...metadata,blobType:blob.type});
    }
    const metadata={...draft,pending};
    return {encrypted:1,keyId,metadata:await encrypt(key,owner,draft.id,'metadata',encoder.encode(JSON.stringify(metadata))),attachments};
}
export async function decryptDraft(key,owner,id,record) {
    const draft=JSON.parse(new TextDecoder().decode(await decrypt(key,owner,id,'metadata',record.metadata)));
    if(draft.id!==id || draft.pending.length!==record.attachments.length) throw new Error('The saved draft could not be verified.');
    draft.pending=await Promise.all(draft.pending.map(async(p,i)=>{
        const {blobType,...metadata}=p;
        return {...metadata,blob:new Blob([await decrypt(key,owner,id,'attachment:'+i,record.attachments[i])],{type:blobType})};
    }));
    return draft;
}
