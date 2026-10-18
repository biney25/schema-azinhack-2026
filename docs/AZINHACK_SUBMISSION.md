# AZINHACK 2026 — submission notes

**Team:** Tushar Aggarwal (solo).  
**Solution:** Schema — scrapbook journal with optional, source-grounded public event context.  
**Mandatory TinyFish:** Web Agent `run-async` + run polling + fact selection before draft creation.

## Problem
A photo preserves what something looked like, not everything surrounding the moment. People forget what an event was called, the date, the program or other publicly documented context. Asking a general AI to fill gaps risks fabricating personal memories.

## Solution / expected impact
People save their own scrapbook pages with photos and personal notes. When they supply a public event page, TinyFish can inspect the visible event and interactive schedule, return only supported facts, and let them choose what belongs in their private draft. Schema separates **my memory** from **public context** and includes the source link.

## AI engineering
- TinyFish navigates dynamic public pages and produces structured event candidates.
- A fixed goal and allowlisted output fields limit what gets returned.
- Facts never enter the journal without the user's explicit selection. The personal-memory AI is a distinct, consent-gated capability in the underlying product.

## Feasibility and tests
- Working existing Schema app source (front-end + back-end and database migrations) is included.
- New TinyFish route, browser UI and validation tests are present.
- Integration requires a server-side `TINYFISH_API_KEY` and `TINYFISH_ENABLED=true`, and an allowlisted demo email via `TINYFISH_ALLOWED_EMAILS`; these are NOT bundled.
- The provided ZIP was tested locally at the helper level; a real provider run and hosted account acceptance remain to be demonstrated.

## Offline build focus (21–22 October)
1. Provision an isolated customer host/database without any production user records.
2. Configure TinyFish key and show a successful public event extraction.
3. Show selected event facts transferred into an editable journal draft, save page, reopen through year archive.
4. Exercise failures, consent, deletion, mobile layout, and explain privacy boundaries.

## Future scope
Consent-led user-selected photo imports, voice memories, recurring memory threads, richer journal layouts, invite-only shared postcards and improved citation-aware personal reflections.
