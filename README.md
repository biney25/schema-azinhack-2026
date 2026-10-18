# Schema · AZINHACK 2026

**The little things, kept.** A private, photo-first scrapbook and personal memory archive, extended with **TinyFish** to let a person enrich their own memories with facts from a *public event page* — only after explicitly reviewing and selecting each fact.

**Pitch deck:** [PDF](submission/Schema_AZINHACK_2026_Final.pdf) · [PowerPoint](submission/Schema_AZINHACK_2026_Final.pptx)  
**Solo participant:** Tushar Aggarwal · Delhi Technological University (Integrated B.Sc./M.Sc. Data Science)  
**Event:** AZINHACK 2026 · USAR, GGSIPU East Delhi · 21–22 October 2026  
**Track:** Open Innovation / AI Engineering

> This repository is a separate hackathon snapshot derived from an existing private Schema development project. The private product, database, and original Sites deployment are not modified or made public by this copy. It is NOT certified for paying customers or million-user scale.

## What it does

- **Scrapbook journal:** create illustrated pages with a photo, personal note, date, theme, voice, optional decorations, tags and people.
- **Life archive:** navigate days, years and collections and search private pages.
- **Privacy first:** user-owned data, optional AI access per page, export/delete and account protections in the underlying product.
- **TinyFish public context (AZINHACK extension):** paste a public HTTPS event link. A server-side TinyFish agent can traverse interactive schedule/lineup tabs and return a *proposed* title, date, venue, lineup, short description and supporting quote. The person checks individual boxes and can open an **editable new draft** containing just the selected facts, clearly separated from their own memory. Nothing is automatically added or published.

### Why TinyFish matters

A plain page download often misses information hidden in interactive pages. TinyFish is instructed to navigate publicly accessible event pages, extract structured evidence and report missing details as missing. This enriches a scrapbook page without requiring the AI to guess what a person experienced.

**Privacy boundary:** no diary notes, private photos, tokens, email or life history are sent to TinyFish. Only an explicitly supplied public URL and fixed extraction instructions go to the agent. Public facts are not treated as first-hand memory. The TinyFish integration does not scrape social accounts or automatically reconstruct a person's life.

## Demo flow

1. Sign in on a configured Schema host and open **My life**.
2. Find **AZINHACK × TINYFISH — A little context for your memory.**
3. Paste an accessible public event URL and confirm permission to read that public page.
4. Wait for the TinyFish agent to complete. Inspect the suggested facts and open the source page.
5. Check **only** the facts you want, then click **Create a draft from reviewed facts**.
6. Add a personal note or photo, edit the page freely, and save it through Schema's existing journal flow.

**Fallback:** When an event page blocks the agent or provides no supported facts, the app shows an error and existing journal drafts remain untouched. The original photo and diary features work without TinyFish.

## Architecture

```
React / Next.js journal UI
   ├── existing private page editor + year archive
   ├── existing platform auth + persistence boundary
   └── TinyFishContext review panel (app/tinyfish-context.tsx)
        ├── POST /api/tinyfish  → agent.tinyfish.ai/v1/automation/run-async
        ├── GET  /api/tinyfish?token=... → /v1/runs/{run_id}
        └── user-approved fields → local new journal draft

private Schema user data        TinyFish worker
        |                            |
        |     NEVER TRANSMITTED       |
        └────────────────────────────X
```

- `app/api/tinyfish/route.ts`: server-side credential isolation, authenticated session check, same-origin POST verification, URL validation, TinyFish job submission and polling.
- `lib/tinyfish/context.mjs`: fixed extraction goal, strict public-URL checks, bounded/whitelisted results, session-bound HMAC research token and 15-minute expiry.
- `app/tinyfish-context.tsx`: explicit consent, progress and error UI, line-item fact approval, provenance and private journal draft creation.
- `tests/tinyfish.test.mjs`: basic URL, parser, signed-token and goal tests.
- `lib/customer/`: separate customer-host auth/database implementation (requires owner-controlled Supabase setup).
- `lib/server/`: legacy private Sites backend, retained for faithful source provenance and private-identity operation. **Do not deploy it as an independently public endpoint**.
- `supabase/migrations/`: schema and ownership/security policies for the customer platform.

## Local development

Prerequisites: **Node.js >=22.13**, **pnpm 11.25** (Corepack), a working platform configuration and credentials for whichever host mode you use.

```bash
corepack enable
corepack pnpm install --frozen-lockfile
# Supported standalone customer mode: set SUPABASE_URL,
# SUPABASE_PUBLISHABLE_KEY and APP_ORIGIN privately.
# Use the supplied .env.example as a reference; never commit real .env files.
corepack pnpm run customer:dev
```

To enable optional public-event research on the **server**, set these in your host secrets:

```dotenv
TINYFISH_ENABLED=true
TINYFISH_API_KEY=your_server_side_api_key
TINYFISH_ALLOWED_EMAILS=the_demo_account_email
```

Get a key from [TinyFish](https://agent.tinyfish.ai/). The key must **never** be included in frontend code or Git history. When missing, the UI gracefully explains that TinyFish is not configured. Only explicitly allowlisted signed-in demo accounts can use the integration. Also set a TinyFish provider-side spending cap before a public demonstration. For the private Sites deployment, use its authorized Sites workflow and bindings instead of trying to run it independently.

**Important setup:** The supplied source contains a customer auth/database adapter, but a fresh contributor has no access to the founder's Supabase project. Follow the migration files on your own isolated Supabase project before attempting customer-mode sign-in. Email confirmation/SMTP and callback URLs also require your own host configuration. Do not point a hackathon demo at the founder's production/customer database.

## Tests

```bash
node --test tests/tinyfish.test.mjs
corepack pnpm run test
corepack pnpm run check
corepack pnpm run customer:build
```

The original source checkpoint historically reports 77 existing automated tests. The new TinyFish adapter's isolated tests are additional; live TinyFish extraction, fresh deployment and end-to-end customer sign-in must be verified after credentials and an isolated host are configured. Never treat unit tests as evidence of an online deployment.

## What is built versus proposed

| Area | Source status |
|---|---|
| Scrapbook UI, journaling, metadata, year archive | Existing implementation in provided ZIP |
| Privacy, drafts, export/delete and persistence adapters | Existing implementation; deploy-dependent acceptance outstanding |
| AI personal memory answers | Consent-gated adapter in code; live provider configuration still required |
| TinyFish public-event extract/review | **Implemented in this separate hackathon source**, with local unit tests; needs configured key for end-to-end run |
| Google Photos whole-library import, native apps, large-scale production certification | **Not implemented / not claimed** |

## Public repository safety

This snapshot intentionally omits the original project's private continuation notes, provider-specific operations records, and local state. No real .env files, live credentials, journals, database export, access tokens or user photos should ever be committed. Re-run secret scanning before publishing any subsequent commit. Public code is not a public journal: all records and media remain private in user-controlled storage.

**License note:** This release is provided for hackathon review. Its appearance on GitHub does not, by itself, grant redistribution or commercial relicensing rights. Some bundled UI/build dependencies retain their own upstream license files.
