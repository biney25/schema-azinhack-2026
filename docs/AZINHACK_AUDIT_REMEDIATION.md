# AZINHACK 2026 — Audit remediation (18 October 2026)

**Scope:** public hackathon repository only. The original Schema Sites application, private database, original ZIP and prior chat were not edited.

## Changes committed

- Compiled TinyFish UI fixed: TypeScript response JSON explicitly typed (previously seven TS18046 errors).
- TinyFish route is restricted to isolated customer mode, confirmed signed-in users and an explicit demo email allowlist; source URL and fixed goal only are sent. Server-side account-locked quota reserved before paid run starts.
- Added migration `20261018200000_azinhack_usage_quotas.sql`: no direct table access to users, atomic 5 TinyFish starts per UTC day and AI monthly plan-based request budgets.
- Added optional, consented `lib/customer/ai.mjs` customer adapter: verified account, allowed demo email, profile plus purpose-specific consent, per-entry AI permission, server-side OpenAI secret, bounded keyword retrieval, source references and no-result abstention.
- Added customer demo setup, public verification ledger and operations runbook; clarified environment settings `SCHEMA_CUSTOMER_HOST=true`, provider keys and isolated Supabase.
- Removed original private Sites hosting metadata and decoupled `vite.config.ts` from it.
- Updated README and synchronized corrected audited PDF/PPTX after SHA-256 verification in a one-time GitHub Action; the one-time workflow was removed afterwards.

## Checks run against the public GitHub code

- `corepack pnpm install --frozen-lockfile --ignore-scripts` succeeded on an isolated fresh GitHub checkout.
- `corepack pnpm test`: **81/81 tests passed**.
- `corepack pnpm check`: **passed** after fixing original TinyFish UI typing and private hosting config reference.
- `corepack pnpm customer:build`: **passed**; Next.js customer build compiled, type checked, generated routes; build verifier confirmed the customer identity boundary.
- Audited deck PDF and PPTX were uploaded to GitHub via checksum-verified workflow and confirmed present at expected new file sizes.

## Still external, not honestly claimable as verified

- Applying SQL migrations and deploying upload/worker functions to a **new** Supabase demo project.
- Verified email account signup, recovery, signed-in save/reopen, deleted accounts, two-account privacy and live backup restore.
- TinyFish provider credentials, real browsing/structured extraction run and explicit approved-facts journal save/reopen.
- OpenAI credentials, model configuration and real source-grounded AI answer tests. Keyword matching is a bounded demo implementation, **not** pgvector/semantic retrieval.
- Vendor-side spending limits, production abuse defense/monitoring, penetration/load tests, data retention decisions, million-user scale and commercial launch approvals.

**Submission judgment:** Source/repository and corrected nine-slide audited proposal are ready for online Round 1. Live-demo release remains gated by the external steps above. Never put keys or user data in GitHub or this document.
