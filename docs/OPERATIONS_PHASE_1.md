# AZINHACK isolated demo operations checklist

- Restrict demo access with verified accounts. Use separate server allowlists for TinyFish and AI, with database quotas plus provider-side spending caps.
- Track errors and failed background jobs without logging prompts or journal contents.
- Disable `TINYFISH_ENABLED` and `AI_ENABLED` immediately if abuse, high spend or exposure is suspected.
- Test database recovery in a **different** isolated project and explicitly record the actual backup retention supplied by the chosen plan.
- Verify account deletion, storage cleanup, expired tokens, revoked sessions and two-account read isolation.
- Publish no firm deletion-time, availability or million-user capacity guarantee without measured acceptance tests.

These are operating requirements, **not** claims of completed testing.
