# Production engineering plan

## Scale model

One million registered accounts is not the same as one million concurrent sessions. Establish DAU, media per active user, daily uploads, archive growth, search frequency, peak concurrency, egress, and AI turns before procurement.

Example planning scenario only: 1,000,000 registered accounts, 100,000 daily users, 10,000 simultaneous sessions, five 1 MB photos per daily user, and two AI turns per active user. This implies around 500 GB/day of new media and 200,000 AI turns/day before derivatives, backups, and retries. It is not a traffic forecast or infrastructure commitment.

## Target topology

Use a CDN for the shell, stateless API replicas, a managed PostgreSQL primary with owner-keyed indexes and proven connection pooling, private object storage, durable queues, processing workers, a search/index service and a separate model gateway. Restrict tenant data with database policies and application checks. Partition media by owner and keep private responses uncached. Authorize every signed URL issuance; keep expiry short and define revocation limitations.

Move compute-heavy tasks off request paths: image reencoding and scanning, thumbnails, EXIF/date extraction, transcription, embeddings, imports, account erasure, ZIP export and recap generation. Jobs need idempotency keys, retry budgets, dead-letter handling, cancellation and permission rechecks. Consent withdrawal must invalidate pending jobs and derived records.

## Release gates

- Functional: complete each promised paid entitlement, recovery path and supported device flow.
- Privacy: test every endpoint with owner, stranger, invited, removed, expired, blocked and anonymous identities.
- Reliability: soak uploads and edits with packet loss, interruptions, retries and simultaneous devices.
- Restore: restore a real test archive into an isolated environment, verify metadata and content checksums, and record achieved RPO/RTO.
- Load: ramp a production-like isolated environment through 100, 1,000, 5,000, and target active sessions; measure p50/p95/p99, failures, DB saturation, queue delay, memory and cost. Define pass thresholds before testing.
- AI: a consent and retrieval corpus including missing evidence, contradictions, sensitive material, hallucinated source requests, prompt injection and deletion. Measure supported answers and abstentions, not only fluent text.
- Billing: successful and failed payments, tampered/replayed/out-of-order webhooks, cancellation, retries, renewals, refunds, account deletion and downgrade storage behaviour.
- Commercial: human support and incident owners, verified contact, privacy/legal documents, refund policy and budget alert ownership.

## Operational defaults to verify

Aim for initial p95 metadata reads under 500 ms and writes under 1 second at the chosen test load, excluding upload and AI time. These are design goals, not measured service levels. Do not promise uptime, unlimited storage or permanent retention without a funded policy and measured operating record.

Set provider spend caps and anomaly alerts before inviting customers. Track storage by account, stale pending assets, failed jobs, expired subscriptions, access-denied anomalies and request error ratios. Keep content out of analytics, error logs and monitoring labels. Maintain an audited operator path; support staff should not browse diaries by default.

## Current references

Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
Cloudflare storage options: https://developers.cloudflare.com/workers/platform/storage-options/
OpenAI text generation: https://developers.openai.com/api/docs/guides/text
OpenAI data controls: https://developers.openai.com/api/docs/guides/your-data
Razorpay webhook validation: https://razorpay.com/docs/webhooks/validate-test/
