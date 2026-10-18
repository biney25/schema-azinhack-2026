import { z } from 'zod';
import { AppError } from './errors.mjs';

export const NOTICE_VERSION = '2026-09-29.1';
export const PURPOSES = {
    storage: { title: 'Saving your journal', description: 'Store your pages and media privately so you can reopen them on your devices. Closing your journal withdraws this choice.' },
    ai: { title: 'AI memory access', description: 'Use only pages you separately permit for the configured AI service. Turning this off stops new AI requests.' },
    sharing: { title: 'Sharing with close people', description: 'Allow postcard and circle actions you deliberately choose. Turning this off revokes your existing postcards and stops new sharing actions.' },
    imports: { title: 'Connected imports', description: 'Allow selected media from a source you connect. This release has no connected import provider.' },
    notifications: { title: 'Gentle notifications', description: 'Allow reminders you configure. Device permission is separate. This release does not send push reminders.' },
};
const stmt = (db, sql, ...args) => db.prepare(sql).bind(...args);
export function consentStatements(db, owner, purpose, enabled, now = new Date().toISOString(), expectedVersion) {
    const guard=expectedVersion===undefined?"EXISTS(SELECT 1 FROM profiles WHERE id=? AND status='active')":"EXISTS(SELECT 1 FROM profiles WHERE id=? AND preferences_version=? AND status='active')";
    const args=expectedVersion===undefined?[owner]:[owner,expectedVersion];
    // Both current choice and immutable event are committed by the caller's batch.
    return [
        stmt(db, `INSERT INTO consent_events(id,owner_id,purpose,enabled,notice_version,created_at)
            SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM consent_choices WHERE owner_id=? AND purpose=? AND enabled=? AND notice_version=?) AND ${guard}`, crypto.randomUUID(),owner,purpose,+enabled,NOTICE_VERSION,now,owner,purpose,+enabled,NOTICE_VERSION,...args),
        stmt(db, `INSERT INTO consent_choices(owner_id,purpose,enabled,notice_version,updated_at) SELECT ?,?,?,?,? WHERE ${guard}
            ON CONFLICT(owner_id,purpose) DO UPDATE SET enabled=excluded.enabled,notice_version=excluded.notice_version,updated_at=excluded.updated_at`, owner,purpose,+enabled,NOTICE_VERSION,now,...args),
    ];
}
export async function privacyState(db, owner, profile) {
    const choices = (await stmt(db,'SELECT purpose,enabled,notice_version,updated_at FROM consent_choices WHERE owner_id=?',owner).all()).results;
    const history = (await stmt(db,'SELECT id,purpose,enabled,notice_version,created_at FROM consent_events WHERE owner_id=? ORDER BY created_at DESC,id DESC LIMIT 50',owner).all()).results;
    return { noticeVersion:NOTICE_VERSION, choices:Object.entries(PURPOSES).map(([purpose,notice])=>{
        const saved=choices.find(c=>c.purpose===purpose);
        return {purpose,...notice,enabled:saved?!!saved.enabled:purpose==='storage'?!!profile.onboarded:purpose==='ai'?!!profile.ai_consent:false,recorded:!!saved,updatedAt:saved?.updated_at??null,available:!['imports','notifications'].includes(purpose)};
    }),history };
}
export async function setConsent(db, owner, input) {
    const parsed=z.object({purpose:z.enum(['ai','sharing','imports','notifications']),enabled:z.boolean(),noticeVersion:z.literal(NOTICE_VERSION)}).safeParse(input);
    if(!parsed.success) throw new AppError(400,'Review the current privacy explanation before changing this choice.');
    const {purpose,enabled}=parsed.data;
    if(enabled && ['imports','notifications'].includes(purpose)) throw new AppError(409,'This feature is not connected yet. Your choice remains off.');
    const statements=consentStatements(db,owner,purpose,enabled);
    if(purpose==='ai') statements.push(stmt(db,'UPDATE profiles SET ai_consent=?,preferences_version=preferences_version+1 WHERE id=?',+enabled,owner));
    if(purpose==='sharing'&&!enabled) statements.push(stmt(db,'DELETE FROM shares WHERE owner_id=?',owner));
    await db.batch(statements);
    return {ok:true};
}
export async function assertSharingAllowed(db, owner) {
    const choice=await stmt(db,"SELECT enabled FROM consent_choices WHERE owner_id=? AND purpose='sharing'",owner).first();
    // An audience choice does not replace a recorded sharing choice.
    if(!choice?.enabled) throw new AppError(403,'Sharing is paused. Enable it in Privacy before sending a postcard or invitation.');
}
