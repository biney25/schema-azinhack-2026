# Billing integration and release gates

Billing is disabled by default. The private development release must not accept live payments.

## Owner configuration

Use Razorpay test mode first. Create monthly and yearly plans matching the UI: INR 9,900 paise monthly and INR 79,900 paise yearly, interval 1. The server fetches the configured plan and rejects a mismatch before creating a subscription. Confirm tax presentation with the business before launch; changing prices requires a coordinated UI/server/plan change.

Configure `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY`, and `RAZORPAY_WEBHOOK_SECRET` through secret controls. Set `BILLING_ENABLED=true` only in an isolated payment-test environment after all required keys and the callback path are ready.

The webhook implementation is `/api/billing/webhook`, but an owner-private Site blocks unauthenticated provider requests at the platform gate. Production needs a public provider-reachable receiver with signature validation, or consumer infrastructure where the webhook can be public while diaries remain authenticated. Do not weaken the diary's authentication to make callbacks work.

## Implemented lifecycle

- The server chooses plan IDs; browser input cannot set price, paid access or owner identity.
- A local checkout claim precedes the create-subscription request. A second checkout cannot create another mandate while the first is unresolved. A matching existing unpaid checkout is reused.
- The checkout callback is only feedback. It cannot grant paid access. Signed webhooks fetch authoritative subscription state before updating entitlements.
- Only active subscriptions with paid cycles extend access through the provider's current paid period. Authenticated/unpaid and pending/failed renewals do not extend access.
- Cancellation ends the recurring mandate immediately and preserves the already verified paid period. Existing diary pages stay readable on downgrade. Cancellation does not issue refunds.
- Entitlements are derived across subscriptions. An old cancellation cannot revoke another valid subscription. Expired access falls back to the free allowance on the next request.
- Invoice requests are owner-scoped, paginated, and return only expected HTTPS provider links.

## Ambiguous checkout procedure

A timeout may mean the provider created a subscription even though Schema did not receive the response. The `billing_checkouts` row intentionally remains `creating`; do not blindly delete this claim or start another checkout. Account deletion is also held until the recurring-mandate state is resolved.

An audited operator must locate the provider subscription using its `notes.account_id` and `notes.schema_checkout`, verify the owner and configured plan, then reconcile the subscription record and release the claim. If no remote subscription exists, confirm that with the provider before releasing the claim. Record the outcome without diary content. An operator UI and automated reconciliation job are still required before public launch.

## Mandatory test-mode scenarios

Successful checkout; abandoned checkout; duplicate submissions; provider timeout before/after create; renewal success/failure; unpaid authorisation; delayed/replayed/out-of-order signed events; bad HMAC; cancellation retries; invoice ownership; price mismatch; expiry; downgrade over quota; account deletion with an active or unresolved mandate; full and partial refunds; disputed charges; key rotation and webhook delivery outage.

The current 32-test suite covers isolated service and contract cases with simulated providers. It does not replace these live integration scenarios. Refund/dispute entitlements and the operator workflow are not implemented. Keep billing off until those behaviours and support ownership are complete.

## Provider references

- [Cancel a subscription](https://razorpay.com/docs/api/payments/subscriptions/cancel-subscription/)
- [Fetch subscription state](https://razorpay.com/docs/api/payments/subscriptions/fetch-subscription-id/)
- [Subscription invoices](https://razorpay.com/docs/api/payments/subscriptions/fetch-invoices/)
- [Create a plan](https://razorpay.com/docs/api/payments/subscriptions/create-plan/)

Documentation checked 28 September 2026. The wrapper uses the subscription, cancellation, plan and invoice APIs described there; recheck their contracts before activating a real merchant integration.
