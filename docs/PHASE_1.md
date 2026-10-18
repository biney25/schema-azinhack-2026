# Phase 1 — accounts, privacy and reliable foundations

Scope agreed 29 September 2026. Web only; native mobile apps excluded. The approved Schema blueprint and the six-phase checklist are the product requirements. This file records acceptance evidence, not completion by assertion.

## Product direction

A private, tactile photo journal: quick first value, optional AI, explicit sharing, no pressure to import a whole life. Preserve Rose Notebook, Lavender Night and Vintage Postcards. Onboarding asks only for a display name, optional birthday, theme and adult declaration; AI/imports/notifications are separate optional decisions after the first page. Do not collect unnecessary personal details.

## Acceptance ledger

| ID | Requirement | Acceptance evidence | Current status |
|---|---|---|---|
| P1-01 | Public customer signup, login and recovery | Verified independent customer identity; real signup/recovery and expired-session tests | Screens/BFF/PKCE implemented and tested; protected Vercel deployment, verified SMTP and real signup/recovery pending |
| P1-02 | Account security/session controls | Reauthentication and revoke-other-session tests against actual identity provider | Current-password checks, recovery freshness and session controls implemented; live provider/browser acceptance pending |
| P1-03 | Journal lock and device draft protection | Nine Web Crypto/IndexedDB tests pass for media, passphrases, corruption, migration, reset and coalescing; UI lock/recording flow implemented | Code verified; real-browser lock/media checks pending |
| P1-04 | Welcome and first-page onboarding | Three-step welcome, privacy/adult declarations, theme/name/optional birthday, first-photo/text editor handoff; API enforcement tests pass | Implemented; authenticated visual journey pending |
| P1-05 | Versioned purpose-specific consent | Storage/AI/sharing/import/notification choices and recent history; withdrawal/CAS/ownership tests pass; SQL trigger blocks late unauthorized sharing | Implemented and API-tested |
| P1-06 | Profile/accessibility preferences | Quiet, standard/large text, optional gentle questions; optimistic preference version and persistence tests pass | Implemented; device/assistive-technology verification pending |
| P1-07 | Production data/storage architecture | Concrete account/schema/ownership/migration/rollback plan; actual provisioned service validated before calling it complete | Schema organization selected; healthy Mumbai Supabase project, four applied migrations/private Storage/RLS; real accounts, restore and scale acceptance pending |
| P1-08 | Reliable page/media persistence | SHA-256-bound upload retries, atomic failure accounting, pending-write exclusion, existing ownership/version tests all pass | Both private and customer adapters verified locally; hosted upload/erasure and later load verification pending |
| P1-09 | Deletion/retention foundations | Erasure idempotency, immediate closure, owner isolation, lease/retry/fencing tests; closed-journal continuation screen; retention boundaries documented | Scheduled worker deployed and invoking successfully; real Storage/Auth erasure, alerts and backup policy/restore pending |
| P1-10 | Background jobs | Durable job ledger and bounded dispatcher tested with real erasure handler; retries/leases/fencing/failure state implemented | Durable PostgreSQL leases/retries and Edge worker scheduled every minute; successful live invocation and invalid-auth rejection observed; real erasure/alerts pending |

## Implementation sequence

1. Preserve current source; confirm platform identity/storage boundaries and choose production provider.
2. Add consent/preferences schema and API, then onboarding/privacy controls.
3. Add device passphrase vault and integrate drafts with safe migration and relocking.
4. Add integrity hardening, job ledger and retryable account erasure.
5. Run focused tests/build; save a private release; update every ledger row with evidence or the exact remaining blocker.

## Architecture decisions

Current private release: Sites dispatch identity, indexed D1 metadata and R2 objects. Never trust client-supplied identity headers in a standalone deployment. The current Site remains owner-private.

Production direction: owner-controlled managed authentication plus PostgreSQL (Supabase created in the user-selected Schema organization after the provider’s $0/month quote and confirmation), private object storage, and a server API enforcing account ownership. Managed auth owns password/OTP/recovery/session rotation. Do not implement ad-hoc passwords or silently link accounts by email. Keep an explicit old-ID/new-ID migration map; verify ownership before any transfer. No migration or change of live data source occurs without an isolated restore/reconciliation and rollback path.

The Sites authentication guidance requires confirming a supported public authentication path before adding external auth. A provider connection and host capability review are prerequisites, not something to fake in the preview. Native app work and public launch remain outside this phase.

Device vault: local privacy control, not end-to-end encryption of the online journal. Use Web Crypto AES-GCM with a randomly generated per-device key wrapped by a passphrase-derived key, fresh IVs and account/record associated data. A lock blocks the normal journal UI and removes unlocked key references. It cannot defend a compromised browser/origin or replace account authentication. Forgotten device passphrases can discard local drafts only; server-saved pages remain available after account sign-in. Do not silently discard existing drafts during migration.

Background foundations: durable jobs with idempotency keys, atomic claims/lease tokens, retry budgets and content-free errors. Use account erasure as the first real handler. An owner-authenticated foreground continuation remains in the private Sites host. The customer PostgreSQL/Edge worker is now invoked autonomously; see PHASE_1_VERIFICATION.md for its evidence and remaining real erasure/alert gates. Do not label a browser loop as a background worker.

## Release boundary

Do not mark Phase 1 complete while P1-01/P1-02/P1-07 or required verification are blocked. Complete independent work and provide one concrete owner action for the blocked integration. Future phases keep their own checklist; none is silently absorbed or removed.

## Latest checkpoint — 30 September 2026

Read `PHASE_1_VERIFICATION.md` for exact evidence and remaining gates. The healthy Supabase project and database migrations now exist; public account screens/BFF and the PostgreSQL journal/media/export adapter are implemented. The scheduled worker is deployed and returning successful invocations; anonymous uploads and invalid worker requests return 401. Build guards preserve the private Site's trusted identity and keep it out of the customer host.

The current automated suite has 77 tests across private-service contracts, PostgreSQL migrations and worker handler, account/cookie contracts, ZIP export, Web Crypto and IndexedDB. TypeScript and both build targets pass. Provider doubles and local PostgreSQL tests are explicitly labelled; no real email, customer login, authenticated browser or hosted erasure test has been claimed.

Phase 1 is still incomplete. The owner previously confirmed no owned domain; Resend has no sending domain. Vercel is connected but its deploy operation failed as unavailable. `CUSTOMER_SETUP.md` records the concrete host/domain/Auth settings and `OPERATIONS_PHASE_1.md` records retention, health, failure recovery and restore work. Do not repeat organization selection or ask to reconnect installed plugins.

`ROADMAP.md` preserves six phases; five follow Phase 1. Continue the open gates here before beginning Phase 2.
