import { z } from 'zod';
import { AppError } from './errors.mjs';

const statement = (db, sql, ...values) => db.prepare(sql).bind(...values);
const one = (db, sql, ...values) => statement(db, sql, ...values).first();
const rows = async (db, sql, ...values) => (await statement(db, sql, ...values).all()).results ?? [];
const run = (db, sql, ...values) => statement(db, sql, ...values).run();
const now = () => new Date().toISOString();
const terminal = new Set(['cancelled', 'completed', 'expired']);
const subscriptionId = z.string().regex(/^sub_[A-Za-z0-9]{1,80}$/);

function parse(schema, value) {
    const result = schema.safeParse(value);
    if (!result.success) throw new AppError(400, 'Check the subscription details and try again.');
    return result.data;
}

// Provider access is server-only. This injection point is used by isolated contract tests.
async function provider(env, path, method = 'GET', body) {
    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
        throw new AppError(503, 'Billing is not connected yet.');
    }
    let response;
    try {
        response = await (env.BILLING_FETCH ?? fetch)('https://api.razorpay.com/v1/' + path, {
            method,
            headers: {
                Authorization: 'Basic ' + btoa(env.RAZORPAY_KEY_ID + ':' + env.RAZORPAY_KEY_SECRET),
                'Content-Type': 'application/json',
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
            signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new AppError(503, 'The payment service did not respond. Refresh billing before trying again.');
    }
    if (!response.ok) throw new AppError(503, 'The payment service could not complete this request. Refresh billing and try again.');
    try { return await response.json(); }
    catch { throw new AppError(503, 'The payment service returned an incomplete response.'); }
}

export async function applyEntitlement(db, owner) {
    // Derive from every subscription, so an old cancelled subscription cannot revoke a newer one.
    const active = await one(db, 'SELECT max(paid_until) AS until FROM subscriptions WHERE owner_id=? AND paid_until>?', owner, now());
    const plan = active?.until ? 'plus' : 'free';
    await run(db, 'UPDATE profiles SET plan=? WHERE id=? AND plan<>?', plan, owner, plan);
    return plan;
}

async function syncSubscription(env, known, current) {
    if (current.id !== known.id || (known.provider_plan && current.plan_id !== known.provider_plan)) {
        throw new AppError(503, 'Subscription verification did not match.');
    }
    const validStates = ['created', 'authenticated', 'active', 'pending', 'halted', 'paused', 'cancelled', 'completed', 'expired'];
    if (!validStates.includes(current.status)) throw new AppError(503, 'Subscription status is unavailable.');
    const paidThrough = current.status === 'active' && Number(current.paid_count) > 0 && Number.isSafeInteger(current.current_end)
        ? new Date(current.current_end * 1000).toISOString() : null;
    // Paid access survives cancellation until the verified paid period ends.
    // A halted/pending renewal never extends the previously paid period.
    await run(env.DB, `UPDATE subscriptions SET state=CASE WHEN state IN ('cancelled','completed','expired') THEN state ELSE ? END,paid_until=CASE WHEN ? IS NOT NULL AND (paid_until IS NULL OR paid_until<?) THEN ? ELSE paid_until END,updated_at=? WHERE id=?`,
        current.status, paidThrough, paidThrough, paidThrough, now(), known.id);
    await applyEntitlement(env.DB, known.owner_id);
    return one(env.DB, 'SELECT * FROM subscriptions WHERE id=?', known.id);
}

async function owned(env, owner, id) {
    parse(subscriptionId, id);
    const record = await one(env.DB, 'SELECT * FROM subscriptions WHERE id=? AND owner_id=?', id, owner);
    if (!record) throw new AppError(404, 'Subscription not found.');
    return record;
}

export async function billingAction(action, input, env, user) {
    const db = env.DB, owner = user.userId;
    if (action === 'status') {
        const subscriptions = await rows(db, 'SELECT id,plan,state,period,paid_until,updated_at FROM subscriptions WHERE owner_id=? ORDER BY updated_at DESC LIMIT 30', owner);
        const pending = await one(db, "SELECT state FROM billing_checkouts WHERE owner_id=? AND state='creating'", owner);
        return { subscriptions, needsReconciliation: !!pending };
    }
    if (action === 'refresh') {
        const known = await owned(env, owner, parse(z.object({ id: subscriptionId }), input).id);
        const current = await provider(env, 'subscriptions/' + known.id);
        await syncSubscription(env, known, current);
        return { ok: true };
    }
    if (action === 'cancel') {
        const value = parse(z.object({ id: subscriptionId, confirm: z.literal('CANCEL') }), input);
        let known = await owned(env, owner, value.id);
        const current = await provider(env, 'subscriptions/' + known.id);
        known = await syncSubscription(env, known, current);
        if (!terminal.has(current.status)) {
            const cancelled = await provider(env, 'subscriptions/' + known.id + '/cancel', 'POST', { cancel_at_cycle_end: false });
            await syncSubscription(env, known, cancelled);
        }
        return { ok: true, paidUntil: known.paid_until };
    }
    if (action === 'invoices') {
        const value = parse(z.object({ id: subscriptionId, skip: z.number().int().min(0).max(100000).default(0) }), input);
        await owned(env, owner, value.id);
        const response = await provider(env, 'invoices?subscription_id=' + value.id + '&count=20&skip=' + value.skip);
        const invoices = (response.items ?? []).filter(i => i.subscription_id === value.id).map(i => {
            let url = null;
            try { const parsed = new URL(i.short_url); if (parsed.protocol === 'https:' && ['rzp.io', 'razorpay.com', 'api.razorpay.com'].includes(parsed.hostname)) url = parsed.href; } catch { /* no link */ }
            return { id: i.id, amount: i.amount, currency: i.currency, status: i.status, issuedAt: i.issued_at, url };
        });
        return { invoices, hasMore: (response.items ?? []).length === 20 };
    }
    if (action !== 'checkout') throw new AppError(404, 'Billing action unavailable.');
    if (env.BILLING_ENABLED !== 'true') throw new AppError(503, 'Subscriptions are not open yet. Your free journal remains available.');
    const { period } = parse(z.object({ period: z.enum(['monthly', 'yearly']) }), input);
    const plan = period === 'monthly' ? env.RAZORPAY_PLAN_MONTHLY : env.RAZORPAY_PLAN_YEARLY;
    if (!plan || !env.RAZORPAY_WEBHOOK_SECRET || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) throw new AppError(503, 'Billing setup is incomplete.');
    const configuredPlan = await provider(env, 'plans/' + encodeURIComponent(plan));
    const expectedAmount = period === 'monthly' ? 9900 : 79900;
    if (configuredPlan.id !== plan || configuredPlan.period !== period || configuredPlan.interval !== 1 || configuredPlan.item?.currency !== 'INR' || configuredPlan.item?.amount !== expectedAmount) {
        throw new AppError(503, 'The payment plan does not match the displayed price. Checkout has been paused.');
    }
    const existing = await one(db, "SELECT * FROM subscriptions WHERE owner_id=? AND state NOT IN ('cancelled','completed','expired') ORDER BY updated_at DESC LIMIT 1", owner);
    if (existing) {
        const current = await provider(env, 'subscriptions/' + existing.id);
        const fresh = await syncSubscription(env, existing, current);
        if (fresh.state === 'created' && fresh.period === period) return { subscriptionId: fresh.id, key: env.RAZORPAY_KEY_ID, email: user.email };
        if (!terminal.has(fresh.state)) throw new AppError(409, 'You already have a subscription or checkout. Manage it in My plan before starting another.');
    }
    // Reserve locally before the provider call. Ambiguous network failures keep this claim;
    // blindly retrying could create a second recurring mandate at the provider.
    const claim = crypto.randomUUID();
    const locked = await one(db, `INSERT INTO billing_checkouts(owner_id,claim,state,created_at) VALUES(?,?,'creating',?) ON CONFLICT(owner_id) DO UPDATE SET claim=excluded.claim,state='creating',created_at=excluded.created_at WHERE billing_checkouts.state='ready' RETURNING claim`, owner, claim, now());
    if (!locked) throw new AppError(409, 'A checkout is being verified. Refresh My plan before trying again.');
    const concurrent = await one(db, "SELECT id FROM subscriptions WHERE owner_id=? AND state NOT IN ('cancelled','completed','expired') LIMIT 1", owner);
    if (concurrent) {
        await run(db, "UPDATE billing_checkouts SET state='ready' WHERE owner_id=? AND claim=?", owner, claim);
        throw new AppError(409, 'Another checkout is already available. Refresh My plan.');
    }
    const sub = await provider(env, 'subscriptions', 'POST', {
        plan_id: plan, total_count: period === 'monthly' ? 120 : 10, customer_notify: 1,
        expire_by: Math.floor(Date.now() / 1000) + 86400,
        notes: { account_id: owner, schema_checkout: claim },
    });
    if (!subscriptionId.safeParse(sub.id).success || sub.plan_id !== plan || sub.status !== 'created') throw new AppError(503, 'Checkout verification is pending. Please refresh billing.');
    await db.batch([
        statement(db, 'INSERT INTO subscriptions(id,owner_id,plan,state,period,provider_plan,updated_at) VALUES(?,?,?,?,?,?,?)', sub.id, owner, 'plus', 'created', period, plan, now()),
        statement(db, "UPDATE billing_checkouts SET state='ready' WHERE owner_id=? AND claim=?", owner, claim),
    ]);
    return { subscriptionId: sub.id, key: env.RAZORPAY_KEY_ID, email: user.email };
}

export async function processWebhook(req, bytes, env) {
    if (!env.RAZORPAY_WEBHOOK_SECRET || !env.DB) throw new AppError(503, 'Webhook unavailable');
    const sig = req.headers.get('x-razorpay-signature') ?? '';
    if (!/^[a-f0-9]{64}$/i.test(sig)) throw new AppError(401, 'Invalid signature');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.RAZORPAY_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signature = Uint8Array.from(sig.match(/../g).map(x => parseInt(x, 16)));
    if (!await crypto.subtle.verify('HMAC', key, signature, bytes)) throw new AppError(401, 'Invalid signature');
    let event;
    try { event = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AppError(400, 'Invalid event'); }
    const eventId = req.headers.get('x-razorpay-event-id');
    if (!eventId || eventId.length > 200) throw new AppError(400, 'Invalid event ID');
    if (await one(env.DB, 'SELECT id FROM webhook_events WHERE id=?', eventId)) return { ok: true };
    const id = event.payload?.subscription?.entity?.id;
    if (!subscriptionId.safeParse(id).success) return { ok: true };
    const known = await one(env.DB, 'SELECT * FROM subscriptions WHERE id=?', id);
    if (!known) return { ok: true };
    await syncSubscription(env, known, await provider(env, 'subscriptions/' + known.id));
    // Record only after successful reconciliation; provider failures must remain retryable.
    await run(env.DB, 'INSERT INTO webhook_events(id,created_at) VALUES(?,?) ON CONFLICT DO NOTHING', eventId, now());
    return { ok: true };
}
