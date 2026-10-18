import { AppError } from './errors.mjs';
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
export const ERASE_BATCH=50;
const MAX_ATTEMPTS=5, LEASE_MS=120000;
export async function requestErasure(db,owner) {
    const now=new Date().toISOString();
    await db.batch([
        stmt(db,"UPDATE profiles SET status='deleting' WHERE id=? AND status='active'",owner),
        stmt(db,`INSERT INTO jobs(id,owner_id,kind,dedupe_key,state,available_at,created_at,updated_at)
            VALUES(?,?,'account_erasure','close-account','pending',?,?,?) ON CONFLICT(owner_id,kind,dedupe_key) DO NOTHING`,crypto.randomUUID(),owner,now,now,now),
        stmt(db,"UPDATE jobs SET state='cancelled',updated_at=? WHERE owner_id=? AND kind!='account_erasure' AND state IN ('pending','running')",now,owner),
    ]);
}
export async function erasureState(db,owner) {
    const job=await stmt(db,"SELECT id,state,attempts,error_code,available_at,updated_at FROM jobs WHERE owner_id=? AND kind='account_erasure' AND dedupe_key='close-account'",owner).first();
    const count=await stmt(db,'SELECT count(*) n FROM assets WHERE owner_id=?',owner).first();
    return {job,remainingFiles:count.n};
}
export async function runErasure(env,owner,{now=new Date()}={}) {
    const db=env.DB, time=now.toISOString(),token=crypto.randomUUID();
    await stmt(db,"UPDATE jobs SET state='failed',error_code='retry_budget_exhausted',lease_token=NULL,lease_until=NULL,updated_at=? WHERE owner_id=? AND kind='account_erasure' AND state='running' AND lease_until<=? AND attempts>=?",time,owner,time,MAX_ATTEMPTS).run();
    const job=await stmt(db,`UPDATE jobs SET state='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
        WHERE owner_id=? AND kind='account_erasure' AND dedupe_key='close-account' AND attempts<?
        AND ((state='pending' AND available_at<=?) OR (state='running' AND lease_until<=?)) RETURNING *`,token,new Date(now.getTime()+LEASE_MS).toISOString(),time,owner,MAX_ATTEMPTS,time,time).first();
    if(!job) {
        const current=await erasureState(db,owner);
        if(current.job?.state==='succeeded') return {ok:true,remaining:false,...current};
        if(current.job?.state==='failed') throw new AppError(503,'Deletion needs support to resume after repeated storage failures. Your journal remains closed.');
        return {ok:true,remaining:true,...current};
    }
    try {
        const profile=await stmt(db,'SELECT email,status FROM profiles WHERE id=?',owner).first();
        if(!profile || !['deleting','deleted'].includes(profile.status)) throw new Error('erasure_not_authorized');
        const assets=(await stmt(db,'SELECT id,key FROM assets WHERE owner_id=? ORDER BY id LIMIT ?',owner,ERASE_BATCH).all()).results;
        if(assets.length) {
            await env.BUCKET.delete(assets.map(a=>a.key));
            // Lease fencing: an expired worker cannot change metadata after another claim.
            await db.batch([
                ...assets.map(a=>stmt(db,"DELETE FROM assets WHERE id=? AND owner_id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND lease_token=? AND state='running')",a.id,owner,job.id,token)),
                stmt(db,"UPDATE profiles SET storage_bytes=(SELECT coalesce(sum(size),0) FROM assets WHERE owner_id=?) WHERE id=? AND EXISTS(SELECT 1 FROM jobs WHERE id=? AND lease_token=? AND state='running')",owner,owner,job.id,token),
                stmt(db,"UPDATE jobs SET state='pending',attempts=0,lease_token=NULL,lease_until=NULL,available_at=?,updated_at=?,error_code=NULL WHERE id=? AND lease_token=? AND state='running'",time,time,job.id,token),
            ]);
            return {ok:true,remaining:true,...await erasureState(db,owner)};
        }
        const guard="EXISTS(SELECT 1 FROM jobs WHERE id=? AND lease_token=? AND state='running')";
        await db.batch([
            stmt(db,`DELETE FROM shares WHERE (owner_id=? OR recipient_id=? OR email=? OR circle_id IN (SELECT id FROM circles WHERE owner_id=?)) AND ${guard}`,owner,owner,profile.email,owner,job.id,token),
            stmt(db,`DELETE FROM members WHERE (user_id=? OR email=? OR circle_id IN (SELECT id FROM circles WHERE owner_id=?)) AND ${guard}`,owner,profile.email,owner,job.id,token),
            ...['entries','circles','audit','usage','reports','subscriptions','billing_checkouts','user_blocks','consent_choices','consent_events'].map(t=>stmt(db,`DELETE FROM ${t} WHERE owner_id=? AND ${guard}`,owner,job.id,token)),
            stmt(db,`DELETE FROM user_blocks WHERE blocked_id=? AND ${guard}`,owner,job.id,token),
            stmt(db,`DELETE FROM jobs WHERE owner_id=? AND kind!='account_erasure' AND ${guard}`,owner,job.id,token),
            stmt(db,`UPDATE profiles SET status='deleted',email='',name='',birthday=NULL,ai_consent=0,storage_bytes=0,plan='free',theme='rose',quiet=0,text_size='standard',question_mode='gentle',onboarding_step='done' WHERE id=? AND ${guard}`,owner,job.id,token),
            stmt(db,"UPDATE jobs SET state='succeeded',lease_token=NULL,lease_until=NULL,error_code=NULL,updated_at=? WHERE id=? AND lease_token=? AND state='running'",time,job.id,token),
        ]);
        const current=await erasureState(db,owner);
        return {ok:true,remaining:current.job?.state!=='succeeded',...current};
    } catch(error) {
        const failed=job.attempts>=MAX_ATTEMPTS;
        await stmt(db,"UPDATE jobs SET state=?,available_at=?,lease_token=NULL,lease_until=NULL,error_code='storage_or_database_failure',updated_at=? WHERE id=? AND lease_token=? AND state='running'",failed?'failed':'pending',new Date(now.getTime()+Math.min(300000,1000*2**job.attempts)).toISOString(),time,job.id,token).run();
        throw new AppError(503,'Deletion was interrupted and will be retried. Your journal is closed; your remaining files have not been marked deleted.');
    }
}

// Scheduler-ready dispatcher. The private Site has no autonomous trigger yet.
// A production scheduler calls this directly with server bindings, never a user-selected owner.
export async function runDueErasureJobs(env,{limit=10,now=new Date()}={}) {
    if(!Number.isInteger(limit)||limit<1||limit>50)throw new Error('Invalid erasure dispatch limit');
    const time=now.toISOString();
    const due=(await stmt(env.DB,`SELECT owner_id FROM jobs WHERE kind='account_erasure'
        AND ((state='pending' AND available_at<=?) OR (state='running' AND lease_until<=?))
        ORDER BY available_at,id LIMIT ?`,time,time,limit).all()).results;
    const result={examined:due.length,completed:0,continuing:0,failed:0};
    for(const job of due){try{const value=await runErasure(env,job.owner_id,{now});value.remaining?result.continuing++:result.completed++;}catch{result.failed++;}}
    return result;
}
