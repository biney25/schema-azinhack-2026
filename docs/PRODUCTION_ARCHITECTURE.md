# Phase 1 production architecture and migration decision

Status: customer implementation provisioned and locally verified; production acceptance remains open. The user selected **Schema** (`<supabase-org-id>`), accepted the provider’s $0/month foundation, and Supabase project `<isolated-supabase-project-id>` was created in Mumbai (`ap-south-1`). Four migrations and two Edge Functions are live; scheduled invocations work. The private Site remains on its previous D1/R2 data. See PHASE_1_VERIFICATION.md for proof and limits. No paid plan, data cutover or public customer launch is authorized by this checkpoint.

## Current and target boundaries

| Concern | Current private Site | Production implementation gate |
|---|---|---|
| Identity | Trusted Sites dispatch identity | Supabase Auth with verified public account/session handling |
| Metadata | Owner-scoped D1 SQLite | Supabase PostgreSQL, explicit grants/RLS, migration reconciliation |
| Media | Private R2; authenticated proxy | Private object storage with upload claims, checksums and deletion reconciliation |
| Compute | Sites Worker | Owner-controlled commercial host supporting auth redirects, cookies, server secrets and jobs |
| Background work | Durable jobs and tested dispatcher; manual deletion continuation | Supabase Cron/Edge worker invocation is live; real hosted erasure and alert/recovery gates remain |
| Payments | Disabled at Site route and capability layer | Separate commercial deployment after provider/business gates |

The official Sites guidance says not to enable financial transactions; it also offers no data-residency guarantee. This private Site is therefore a development/review surface, not the eventual paid hosting target. Do not enable the old payment adapter here just by adding keys. Never deploy `app/chatgpt-auth.ts` directly to a public standalone Worker: its identity headers are trusted only behind Sites dispatch.

## Account contract

Managed Supabase Auth owns passwords, verification, OTP/recovery and token refresh. No custom password database. Begin with verified email/password, optional supported Google sign-in when configured. Never authorize from user-editable metadata. Use the stable authenticated UUID as the tenant key; email is a contact attribute, not an ownership key.

Create per-request SSR clients with PKCE and secure, appropriate SameSite cookies. Apply no-store to personalized responses and all responses that refresh credentials; do not cache Set-Cookie or initialize a session-bearing client globally. Validate identities with the current supported server verification API. A locally valid JWT alone does not prove a session was not revoked; sensitive account/export/erasure actions require a live session check and reauthentication.

Required screens and states: signup, sign-in, verify email, resend/cooldown, forgot password, recovery callback, set new password, invalid/expired link, expired session with retained local draft, security settings, change email/password, revoke other sessions, sign out, optional MFA enrollment/challenge/recovery when supported and enabled. Device passphrase is independent from account password/recovery.

Acceptance scenarios: fresh verified account; duplicate email without enumeration; invalid password; expired/replayed callback; disallowed redirect; session refresh; revoked other-device session; password/email change reauthentication; deleted account using an old access token; cross-account browser switch; lost connection during refresh. Email delivery needs a real configured sender/SMTP before public release. Do not claim a screen is a working flow without that integration.

## PostgreSQL model and authorization

Use typed domain repositories rather than translating SQLite SQL strings with regular expressions. The Phase 1 customer adapter preserves DTOs and rewrites journal/media/consent/jobs transactionally for PostgreSQL. Do not translate SQLite strings. Future phase cutover must inventory and migrate all existing tables: profiles, entries, assets, circles, members, shares, audit, usage, subscriptions, webhook_events, billing_checkouts, user_blocks, reports, consent_choices, consent_events and jobs. Verify the schema inventory against actual source before migration.

- `profiles`: authenticated UUID primary key; active/deleting/deleted lifecycle; preferences version, archive revision, plan and usage are server-owned. The client cannot grant itself paid access or edit storage counters.
- `entries`: owner FK, entry UUID, date/timezone/provenance, content, structured layout, optimistic version and timestamps. Index `(owner_id,date DESC,id DESC)`; updates match owner and expected version.
- `assets`: immutable asset UUID, owner FK, private storage key, state, SHA-256/type/size. Unique key and owner/id index. Referenced media must be owned, ready and not being deleted.
- Prefer normalized `entry_assets` ownership-preserving relationships over an unvalidated JSON array. Same-owner FK/transaction checks prevent cross-tenant attachments.
- `shares`: explicit owner-created snapshot and accepted recipient UUID/circle membership, expiry and revocation. A member sees the permitted snapshot, not the underlying private entry. Revocation checks apply at reads as well as grant creation.
- `consent_choices` and `consent_events`: versioned purpose-specific current state/history. History is append-only during an account's life and included in authorized erasure. Separate operational/legal retention must have a justified published policy.
- `jobs`: unique `(owner_id,kind,dedupe_key)`, due state indexes, attempt count, lease token/expiry, cancellation and content-free error code. Ownership and consent are rechecked by handlers.

Enable RLS for all exposed tables and explicitly grant only needed operations. Default deny for anonymous access. Read/write policies include stable account ownership, active account state and both USING/WITH CHECK for updates. Hide server-owned billing, quota, job and audit writes from the client. Keep privileged helpers non-exposed with fixed search_path, limited execute grants and explicit identity checks; prefer security-invoker code. Run advisors and real owner/stranger/anonymous query tests after applying migrations.

## Media and transaction rules

Create an upload intent, atomically reserve quota and bind an idempotency key to expected bytes/type/checksum. Upload privately, validate/reencode off the request path as required, then finalize only the correct intent. Never trust claimed Content-Type, sizes or client ownership. Limits apply before reading the full upload. Storage and SQL are not one transaction: retain durable recoverable states and reconcile stranded objects/reservations.

Reads must check current ownership or the live accepted share. Short-lived signed URLs need a documented revocation window; the current authenticated proxy gives a simpler immediate permission boundary. Do not make buckets public. Storage keys contain opaque identifiers rather than names. Keep content and precise location out of diagnostics.

## Erasure, jobs and retention

Current `lib/server/jobs.mjs` provides an idempotent erasure job, leases, fencing, five failure attempts with backoff, cancellation of other pending work, 50-object batches, metadata finalization and a minimal identity tombstone. `runDueErasureJobs` is a tested bounded dispatcher. It is **not scheduled in the current Site**. The user can continue through the closed-journal progress screen. The standalone customer implementation uses a separate PostgreSQL ledger, service-role-only worker RPC, single-use dispatch tokens, pg_cron and pg_net; this scheduler is deployed and has verified HTTP 200 invocations.

Production completion requires scheduled invocation, least-privilege server credentials, failed-job alerts, an audited resume action and tested recovery after worker crashes. Account close first blocks normal reads/writes/shares, then removes objects and derived records, clears memberships and profile content, revokes provider sessions and finalizes identity deletion in a safe order. Keep a minimal tombstone until late requests cannot recreate content. Specify and test handling of in-flight uploads/processing.

Live-row erasure is separate from backups, logs and any justified financial retention. Exact backup retention, region, access controls and deletion SLA must be selected with the provisioned plan. Do not advertise a number of days without that policy. Drafts and downloaded exports on other devices cannot be erased remotely by deleting server rows.

## Migration, restore and rollout checklist

1. Select organization and confirm quoted project cost; create isolated staging resources. Record actual region, plan, versions, backup features and limits without secrets.
2. Apply reviewed schema/ownership policies; run advisors and two-account isolation checks. Generate client types from the real schema.
3. Provision commercial host and sender; verify redirects, cookies, refresh, reauthentication and revoked-session behavior. Keep Sites private throughout.
4. Export D1/R2 under a write freeze or tested consistent snapshot. Store a migration manifest, record counts, content checksums and old/new identity map. Linking requires verified ownership, never an email-only match.
5. Import into staging; reconcile every table, object and relationship. Re-run existing service contracts against the PostgreSQL repository and actual storage. Record rejected/ambiguous data for review rather than silently dropping it.
6. Restore from backup into a separate environment and measure recovery. Retain the known-good source and encrypted export until cutover acceptance.
7. Rehearse rollback before cutover. Avoid dual-writing without an idempotent outbox/reconciliation design. Keep old data read-only during the rollback window; new production writes require a reverse-migration/export plan.
8. Ramp realistic load with predeclared targets, including large journals and pending jobs. Observe p95/p99 latency, lock contention, queue delay, errors and cost. Capacity claims follow measurements, not service names.

## Verification remaining

The deployed foundation has RLS, private Storage, customer account routes and scheduled work. Local PostgreSQL/contract tests and live scheduler/auth-rejection evidence are in PHASE_1_VERIFICATION.md. Real customer email/account/session flows, hosted Storage/Auth erasure, authenticated desktop/mobile/device checks, alert delivery, backup retention and an isolated restore remain acceptance gates. Resend has no verified sender domain; Vercel's connected deployment operation failed as unavailable. Do not conflate a passing build, local test or empty worker sweep with production acceptance.

The security advisor's pg_net namespace warning and intentional private-table default-deny INFO findings are recorded precisely, including the automatically rejected extension reinstall and provider-owned grants. Keep the working schedule intact; no destructive workaround was attempted.

## Primary references reviewed

- https://learn.chatgpt.com/docs/sites
- https://supabase.com/changelog.md (reviewed 29 September 2026; no existing Supabase project to upgrade)
- https://supabase.com/docs/guides/auth/server-side/advanced-guide
- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/api/securing-your-api
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey
