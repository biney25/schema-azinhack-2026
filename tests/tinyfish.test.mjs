import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublicUrl,parsePublicFacts,issueRunToken,verifyRunToken,EVENT_GOAL} from '../lib/tinyfish/context.mjs';

test('public URLs only, safe protocol, no credentials or IPs',()=>{
 assert.equal(parsePublicUrl('https://events.example.org/show#tickets'),'https://events.example.org/show');
 for(const url of ['http://events.example.org','https://localhost/admin','https://127.0.0.1/','https://[::1]/','https://user:pass@example.org','https://example.org:9000/private','https://intranet.local', 'file:///etc/passwd'])assert.throws(()=>parsePublicUrl(url),undefined,url);
});
test('event facts are whitelisted, bounded and refuse hallucinated blank outputs',()=>{
 const f=parsePublicFacts('```json\n{"title":"Open Mic","date":"2026-10-20","venue":"Commons","lineup":["A", "B"],"privateNotes":"leak"}\n```','https://events.example.org/open-mic');
 assert.equal(f.title,'Open Mic');assert.deepEqual(f.lineup,['A','B']);assert.equal(f.privateNotes,undefined);
 assert.throws(()=>parsePublicFacts('{}','https://events.example.org'));
});
test('run token is scoped to owner and URL, verifies signature and expires',async()=>{
 const now=Date.now(),secret='test-key-not-a-real-api-key',owner='user-1';
 const token=await issueRunToken('run_123456',owner,secret,'https://events.example.org/open',now);
 const payload=await verifyRunToken(token,owner,secret,now+500);
 assert.equal(payload.runId,'run_123456');assert.equal(payload.sourceUrl,'https://events.example.org/open');
 await assert.rejects(verifyRunToken(token,'user-2',secret,now));
 await assert.rejects(verifyRunToken(token,owner,secret,now+16*60*1000));
 await assert.rejects(verifyRunToken(token+'a',owner,secret,now));
});
test('agent goal prohibits logins and requires source evidence',()=>{
 assert.match(EVENT_GOAL,/Do not log in/);assert.match(EVENT_GOAL,/evidence/);assert.match(EVENT_GOAL,/Never invent/);
});
