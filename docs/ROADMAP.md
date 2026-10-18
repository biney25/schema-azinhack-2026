# Schema — the six-phase product roadmap

The approved `Schema_Product_Blueprint.docx` remains the product source of truth. This roadmap turns it and the user's original photo-album/journal/companion/close-friends ideas into implementation gates. Phase 1 is underway; five subsequent phases remain. Native Android/iOS apps are excluded by the user; responsive mobile web remains required. A working feature in the private release does not count as a fully verified phase.

## Product principles that apply throughout

- The journal and photo book are the main product. AI chat is one supporting feature.
- Keep a tactile handmade diary: paper, notebook covers, polaroids, tape, doodles, stickers, warm typography, responsive spreads and thoughtful motion. Rose Notebook, Lavender Night and Vintage Postcards establish the visual system.
- Capture an ordinary day quickly; decorate later. Questions are short, contextual and optional. No shame, guilt, compulsory streak or pressure to fill missing days.
- Private by default; selected postcards and close circles, never an automatically public diary/feed.
- AI remembers only documented, permitted material. Show sources, allow correction/forgetting, and admit missing evidence. Memory is not a guarantee of perfect recall or prediction.
- ₹99 monthly / ₹799 yearly are proposed Plus prices, subject to storage/AI/support costs. Do not promise infinite storage or permanent preservation without funded policy.
- Keep imported dates, people and AI suggestions reviewable. No scraping an unrestricted internet biography or silently collecting contacts.
- Every phase includes loading/empty/offline/error/permission states, accessibility, isolation, migration, regression tests, and saved source. Marketing cannot claim unverified features.

## Phase 1 — accounts, privacy and reliable foundations

Detailed acceptance evidence: `PHASE_1.md`. Production integration design: `PRODUCTION_ARCHITECTURE.md`.

Public signup/login/email verification/recovery, account sessions and reauthentication; device lock and encrypted drafts; complete welcome/first-page flow; separate consent/history; profile/quiet/readable-text preferences; production account/database/storage model; save conflicts, upload integrity and quota accounting; erasure and retention; durable job foundations. Completion includes actual provider verification, not only UI or mocked requests.

## Phase 2 — the complete scrapbook and daily ritual

- Photo selection, arrangement, drag/resize/rotate/crop, layering and alignment; touch and keyboard equivalents.
- Handwriting fonts, doodles, stickers, washi tape, photo frames, decorative blocks, notebook covers, themes and reusable templates. Preserve real text readability beneath decorative surfaces.
- Voice capture/playback, accessible controls and permission recovery. Optional transcription is Phase 4 processing.
- Quick capture versus decorate-later flow; constrained automatic layouts; robust undo/redo and safe autosave. Fullscreen/day reading, page turning and reduced-motion alternatives.
- Interactive but skippable questions; daily vibes, optional reflection cards, user-set reminders, notification permissions, quiet hours/timezones and notification centre.
- Offline drafts/queue, deliberate sync/retry, clear local-versus-cloud status, connection loss, browser reload and device conflict recovery. Do not mislabel a client retry as background sync.
- Screens: Today, quick capture, full editor, media picker/details, reader, draft inbox/recovery, covers/themes/template library, reminder and accessibility settings.
- Gate: a person completes the daily photo-to-page ritual on desktop and mobile, with keyboard access, failed connectivity and no lost content.

## Phase 3 — a lifetime archive, imports and portability

- Life shelf, years/months/ages/day calendar, chronological timeline, events and milestones, people/place/idea collections, confirmed links between memories.
- Search/filter/sort/pagination; reliable date/timezone handling; resurfacing, hidden memories, muted dates/people and control over difficult anniversaries.
- Original/edited provenance and revision history; uncertain historical dates; review before inferred links or imported content becomes authoritative.
- Bulk uploads, supported Google Photos selection, selected social export parsers, duplicate detection and resumable import jobs with progress/error review/disconnect cleanup. Validate current API capabilities and permissions before promising integrations.
- Import/export queues and resumable portable archives; editable/printable albums; restore testing. Existing browser ZIP export is a foundation, not the completed large-archive workflow.
- Video only after processing limits, costs, formats and player accessibility are verified. Do not advertise an unimplemented media entitlement.
- Screens: Life shelf, year/month/day, timeline, collections/detail, search, memory resurfacing controls, import connection/review/progress, duplicates, history/provenance, export progress/download.
- Gate: historical/imported memories can be reviewed, organized, found and exported without losing dates, ownership or media.

## Phase 4 — an emotional, grounded personal companion

- Connect the model provider securely; consent-gated photo descriptions, transcription and optional contextual capture questions.
- Per-page AI permissions; semantic retrieval, confirmed long-term facts, dated source references, conversations/threads and editable weekly/annual recaps.
- Warm companion tones/roles including friend, supportive parent-like, partner-like and imagined future self. Explicitly frame these as AI styles. Memorial reflections use approved memories and never claim to be a deceased person or have undocumented knowledge.
- Correct facts, inspect remembered material, forget a page/person/fact, and propagate deletion through indexes, transcripts, embeddings, summaries and pending jobs.
- Respect sensitive days, emotional distress, healthy boundaries, notification quiet settings and user control. No diagnostic, supernatural prediction or human-identity claims.
- Provider timeouts, quota/spend controls, consent rechecks at execution, prompt-injection resistance and grounded-answer/abstention evaluations.
- Screens: companion conversations, memory/source drawer, remembered-fact review, tone/role settings, recap edit/review, AI permissions/cost limits, deletion and correction feedback.
- Gate: evidence-backed personal reflection, tested with contradictions, missing evidence, revoked consent and erased memories. No “remembers everything” claim unsupported by the implementation.

## Phase 5 — close people and the commercial product

- Granular sharing/audience/redaction, invitation acceptance, expirations, revocation and previews of exactly what will be shared.
- Private circles/albums, collaborative pages with explicit authorship/rights, comments/reactions and close-friend activity without public popularity pressure.
- Member removal, leaving/deleting confirmations, reporting/blocking, pagination, moderation queues and audited operator/support tools.
- Free/Plus entitlements, live checkout lifecycle, renewal/cancel/downgrade grace rules, invoices, refunds/disputes, verified webhook reconciliation, taxes/business details and tested failure recovery.
- Evaluate more expensive Extra/Family plans against actual economics; no unlimited media promise at ₹99. Keep storage, processing, AI, egress, fees and support costs separate in the model.
- Managed legacy/access process, trusted-person permissions, export/access dispute rules and verified support escalation. No automatic loved-one impersonation or transfer.
- Screens: friends/circles, invitations, shared album/postcard, coauthor/comments, audience/redaction, notifications, report/moderation, pricing/checkout, subscription/storage/receipt/refund/support.
- Gate: real controlled provider tests, explicit sharing authorization, tested moderation/support and profitable bounded entitlements before inviting paid users.

## Phase 6 — prove and launch

- Full cross-device/browser journeys, accessibility/assistive-technology review, slow/offline/retry/soak tests, security review and penetration test.
- Representative load tests against provisioned production infrastructure, restore drill with measured RPO/RTO, schema rollout/rollback and data reconciliation.
- Error/performance/queue/cost monitoring, paging, incident response, abuse controls, rate limits, support and moderation staffing.
- Final business-owned privacy/terms/refund/retention/subprocessor documents and actual service contacts; verify requirements for launch regions and age policy.
- Closed beta with acceptance metrics, corrective work, staged rollout and explicit go/no-go. Domain, production email, backups and real on-call ownership are launch dependencies.
- Gate: all promised features and failure paths verified; capacity described by measured traffic assumptions. One million registered accounts is a scale target, not a certification from passing unit tests.

## Phase accounting

There are six phases, not six after Phase 1. When Phase 1's remaining acceptance gates pass, five phases remain. Until then, report “Phase 1 incomplete + five subsequent phases,” never silently redefine Phase 1 to make it appear finished.
