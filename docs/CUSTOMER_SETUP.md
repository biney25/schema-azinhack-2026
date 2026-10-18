# AZINHACK isolated demo setup

This public GitHub project is **separate** from the original private Schema Sites app. Never reuse its real user data, runtime identity, database or secrets.

1. Create a fresh Supabase demo project. Apply every migration under `supabase/migrations` chronologically, including `20261018200000_azinhack_usage_quotas.sql`. Deploy the provided upload and background worker functions to that project.
2. Configure email sender, the site's Auth URL and exact callback `/auth/callback`; test signup, verified email, recovery and two-account isolation.
3. Run `corepack pnpm install --frozen-lockfile` with Node >=22.13, then `corepack pnpm test`, `corepack pnpm check`, `corepack pnpm customer:build`.
4. For standalone hosting, configure these **server-only** secrets: `SCHEMA_CUSTOMER_HOST=true`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_ORIGIN` (exact https origin). For local development only, the origin may be `http://localhost:3000`.
5. To demonstrate TinyFish, separately set `TINYFISH_ENABLED=true`, `TINYFISH_API_KEY` and `TINYFISH_ALLOWED_EMAILS`; each demo account has 5 research starts per UTC day after migration. Apply an external TinyFish spend cap.
6. To demonstrate sourced AI recall, separately set `AI_ENABLED=true`, `AI_ALLOWED_EMAILS`, `OPENAI_API_KEY`, `OPENAI_MODEL`. Explicit consent and per-page AI permission are still required. Monthly per-account request quotas apply. A request can consume an allowance even if the provider fails. AI sees only selected permitted diary text, not all pages. The retrieval algorithm is bounded keyword matching, not production semantic search.
7. Verify an event link, field-by-field approval, actual saved journal draft, reopening, error handling, account deletion, and two-account isolation. Do not claim these steps passed without live provider testing.

**Security limits:** The app filters public URLs but cannot by itself guarantee vendor-side DNS/egress safety. Keep production deployment disabled until auth, live APIs, cost caps, alarms, backup restoration, security reviews, and legal compliance are independently verified.
