import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { query, pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
const router = Router();
router.use(requireAuth);
function referralCode(seed) {
    const raw = seed.replace(/-/g, '').slice(0, 10).toUpperCase();
    return `AAS${raw}`;
}
router.get('/loyalty', requireRoles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
    try {
        await query(`INSERT INTO loyalty_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`, [req.authUser.id]);
        const account = await query(`SELECT id,points,lifetime_earned,lifetime_redeemed,created_at,updated_at FROM loyalty_accounts WHERE user_id=$1`, [req.authUser.id]);
        const transactions = await query(`SELECT id,direction,points,source_type,source_id,metadata,created_at FROM loyalty_transactions WHERE loyalty_account_id=$1 ORDER BY created_at DESC LIMIT 50`, [account.rows[0].id]);
        res.json({ account: account.rows[0], transactions: transactions.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/loyalty/redeem-to-wallet', requireRoles('CUSTOMER'), async (req, res, next) => {
    const client = await pool.connect();
    try {
        const input = z.object({ points: z.number().int().positive().max(100000), idempotencyKey: z.string().min(8).max(120) }).parse(req.body);
        await client.query('BEGIN');
        const account = await client.query(`SELECT id,points FROM loyalty_accounts WHERE user_id=$1 FOR UPDATE`, [req.authUser.id]);
        if (!account.rows[0]) {
            await client.query('ROLLBACK');
            res.status(404).json({ error: 'LOYALTY_ACCOUNT_NOT_FOUND' });
            return;
        }
        const existing = await client.query(`SELECT id,metadata FROM loyalty_transactions WHERE idempotency_key=$1`, [input.idempotencyKey]);
        if (existing.rows[0]) {
            await client.query('COMMIT');
            res.json({ reused: true, transactionId: existing.rows[0].id });
            return;
        }
        if (Number(account.rows[0].points) < input.points) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: 'INSUFFICIENT_LOYALTY_POINTS', availablePoints: Number(account.rows[0].points) });
            return;
        }
        // 100 loyalty points = ₹1 wallet credit. Both ledger entries are atomic.
        const wallet = await client.query(`INSERT INTO wallet_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id`, [req.authUser.id]);
        const amount = Math.floor(input.points / 100) * 100;
        if (amount < 100) {
            await client.query('ROLLBACK');
            res.status(400).json({ error: 'MINIMUM_REDEMPTION_100_POINTS' });
            return;
        }
        const pointsUsed = Math.floor(amount / 100) * 100;
        const lt = await client.query(`INSERT INTO loyalty_transactions(loyalty_account_id,direction,points,source_type,idempotency_key,metadata) VALUES($1,'REDEEM',$2,'WALLET_REDEMPTION',$3,$4) RETURNING id`, [account.rows[0].id, pointsUsed, input.idempotencyKey, JSON.stringify({ walletAmountPaise: amount })]);
        await client.query(`UPDATE loyalty_accounts SET points=points-$1,lifetime_redeemed=lifetime_redeemed+$1,updated_at=NOW() WHERE id=$2`, [pointsUsed, account.rows[0].id]);
        await client.query(`INSERT INTO wallet_transactions(wallet_id,direction,amount_paise,transaction_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,'CREDIT',$2,'LOYALTY_REDEMPTION','LOYALTY',$3,$4,$5)`, [wallet.rows[0].id, amount, lt.rows[0].id, input.idempotencyKey, JSON.stringify({ points: pointsUsed })]);
        await client.query(`UPDATE wallet_accounts SET balance_paise=balance_paise+$1,updated_at=NOW() WHERE id=$2`, [amount, wallet.rows[0].id]);
        await client.query('COMMIT');
        res.status(201).json({ redeemedPoints: pointsUsed, walletCreditPaise: amount, transactionId: lt.rows[0].id });
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        next(e);
    }
    finally {
        client.release();
    }
});
router.get('/referral', requireRoles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
    try {
        const existing = await query(`SELECT id,referral_code FROM referral_accounts WHERE user_id=$1`, [req.authUser.id]);
        let code = existing.rows[0]?.referral_code;
        if (!code) {
            code = referralCode(req.authUser.id);
            let attempt = 0;
            while (attempt < 5) {
                try {
                    const r = await query(`INSERT INTO referral_accounts(user_id,referral_code) VALUES($1,$2) RETURNING referral_code`, [req.authUser.id, code]);
                    code = r.rows[0].referral_code;
                    break;
                }
                catch (e) {
                    attempt++;
                    code = `AAS${req.authUser.id.replace(/-/g, '').slice(0, 7).toUpperCase()}${attempt}`;
                }
            }
        }
        const events = await query(`SELECT re.id,re.referred_user_id,re.qualifying_order_id,re.reward_points,re.status,re.created_at,re.rewarded_at,cp.customer_code FROM referral_events re LEFT JOIN customer_profiles cp ON cp.user_id=re.referred_user_id WHERE re.referrer_user_id=$1 ORDER BY re.created_at DESC LIMIT 100`, [req.authUser.id]);
        res.json({ referralCode: code, events: events.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/referral/apply', requireRoles('CUSTOMER'), async (req, res, next) => {
    try {
        const input = z.object({ code: z.string().trim().toUpperCase().min(4).max(24) }).parse(req.body);
        const ref = await query(`SELECT user_id FROM referral_accounts WHERE referral_code=$1`, [input.code]);
        if (!ref.rows[0]) {
            res.status(404).json({ error: 'REFERRAL_NOT_FOUND' });
            return;
        }
        if (ref.rows[0].user_id === req.authUser.id) {
            res.status(409).json({ error: 'SELF_REFERRAL' });
            return;
        }
        const existing = await query(`SELECT id FROM referral_events WHERE referred_user_id=$1`, [req.authUser.id]);
        if (existing.rows[0]) {
            res.status(409).json({ error: 'REFERRAL_ALREADY_APPLIED' });
            return;
        }
        const r = await query(`INSERT INTO referral_events(referrer_user_id,referred_user_id,referral_code,status) VALUES($1,$2,$3,'PENDING') RETURNING id,status`, [ref.rows[0].user_id, req.authUser.id, input.code]);
        await audit('REFERRAL_APPLIED', 'referral_events', r.rows[0].id, req.authUser.id, { code: input.code });
        res.status(201).json({ referral: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.get('/membership-plans', requireRoles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN'), async (_req, res, next) => {
    try {
        const r = await query(`SELECT id,code,name,monthly_price_paise,annual_price_paise,benefits,is_active FROM membership_plans WHERE is_active=true ORDER BY monthly_price_paise ASC`);
        res.json({ plans: r.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.get('/membership', requireRoles('CUSTOMER', 'SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
    try {
        const r = await query(`SELECT cm.*,mp.code plan_code,mp.name plan_name,mp.monthly_price_paise,mp.annual_price_paise,mp.benefits
    FROM customer_memberships cm JOIN membership_plans mp ON mp.id=cm.plan_id
    WHERE cm.user_id=$1 ORDER BY cm.created_at DESC LIMIT 1`, [req.authUser.id]);
        res.json({ membership: r.rows[0] ?? null, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/membership/start', requireRoles('CUSTOMER'), async (req, res, next) => {
    try {
        const input = z.object({ planId: z.string().uuid(), billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY') }).parse(req.body);
        const plan = await query(`SELECT * FROM membership_plans WHERE id=$1 AND is_active=true`, [input.planId]);
        if (!plan.rows[0]) {
            res.status(404).json({ error: 'MEMBERSHIP_PLAN_NOT_FOUND' });
            return;
        }
        const active = await query(`SELECT id FROM customer_memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`, [req.authUser.id]);
        if (active.rows[0]) {
            res.status(409).json({ error: 'MEMBERSHIP_ALREADY_ACTIVE', membershipId: active.rows[0].id });
            return;
        }
        const pending = await query(`SELECT id FROM customer_memberships WHERE user_id=$1 AND status='PENDING' ORDER BY created_at DESC LIMIT 1`, [req.authUser.id]);
        if (pending.rows[0]) {
            res.status(409).json({ error: 'MEMBERSHIP_CHECKOUT_ALREADY_PENDING', membershipId: pending.rows[0].id });
            return;
        }
        const sub = await query(`INSERT INTO customer_memberships(user_id,plan_id,status) VALUES($1,$2,'PENDING') RETURNING *`, [req.authUser.id, input.planId]);
        await query(`INSERT INTO membership_events(membership_id,event_type,metadata) VALUES($1,'CHECKOUT_REQUIRED',$2)`, [sub.rows[0].id, JSON.stringify({ billingCycle: input.billingCycle, planCode: plan.rows[0].code })]);
        await audit('CUSTOMER_MEMBERSHIP_STARTED', 'customer_memberships', sub.rows[0].id, req.authUser.id, { billingCycle: input.billingCycle, planId: input.planId });
        res.status(201).json({ membership: sub.rows[0], plan: plan.rows[0], nextAction: 'PROVIDER_CHECKOUT_REQUIRED' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/admin/memberships/:id/provider-state', requirePermission('MANAGE_SETTLEMENTS'), async (req, res, next) => {
    try {
        const id = z.string().uuid().parse(req.params.id);
        const input = z.object({ status: z.enum(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'PENDING', 'EXPIRED']), providerCustomerId: z.string().max(255).optional(), providerSubscriptionId: z.string().max(255).optional(), providerEventId: z.string().max(255).optional(), renewsAt: z.string().datetime().optional().nullable() }).parse(req.body);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (input.providerEventId) {
                const replay = await client.query(`SELECT id FROM membership_events WHERE provider_event_id=$1`, [input.providerEventId]);
                if (replay.rows[0]) {
                    await client.query('COMMIT');
                    res.json({ ok: true, replayed: true });
                    return;
                }
            }
            if (input.status === 'ACTIVE')
                await client.query(`UPDATE customer_memberships SET status='CANCELLED',updated_at=NOW() WHERE user_id=(SELECT user_id FROM customer_memberships WHERE id=$1) AND status='ACTIVE' AND id<>$1`, [id]);
            const r = await client.query(`UPDATE customer_memberships SET status=$1,provider_customer_id=COALESCE($2,provider_customer_id),provider_subscription_id=COALESCE($3,provider_subscription_id),renews_at=$4,starts_at=CASE WHEN $1='ACTIVE' AND starts_at IS NULL THEN NOW() ELSE starts_at END,updated_at=NOW() WHERE id=$5 RETURNING *`, [input.status, input.providerCustomerId ?? null, input.providerSubscriptionId ?? null, input.renewsAt ?? null, id]);
            if (!r.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'MEMBERSHIP_NOT_FOUND' });
                return;
            }
            await client.query(`INSERT INTO membership_events(membership_id,event_type,provider_event_id,metadata) VALUES($1,$2,$3,$4)`, [id, `PROVIDER_${input.status}`, input.providerEventId ?? null, JSON.stringify(input)]);
            await client.query('COMMIT');
            await audit('CUSTOMER_MEMBERSHIP_PROVIDER_STATE', 'customer_memberships', id, req.authUser.id, input);
            res.json({ membership: r.rows[0] });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (e) {
        next(e);
    }
});
router.get('/admin/campaigns', requirePermission('MANAGE_SYSTEM_CONFIG'), async (_req, res, next) => {
    try {
        const r = await query(`SELECT p.*,v.name vendor_name,c.name category_name,sz.name zone_name,COUNT(pr.id)::int redemptions FROM promotions p LEFT JOIN vendors v ON v.id=p.vendor_id LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN service_zones sz ON sz.id=p.service_zone_id LEFT JOIN promotion_redemptions pr ON pr.promotion_id=p.id GROUP BY p.id,v.id,c.id,sz.id ORDER BY p.created_at DESC LIMIT 500`);
        res.json({ campaigns: r.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/admin/campaigns', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const input = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/), title: z.string().trim().min(2).max(120), description: z.string().max(1000).optional(), discountType: z.enum(['PERCENT', 'FLAT']), discountValue: z.number().int().positive(), maxDiscountPaise: z.number().int().positive().optional().nullable(), minOrderPaise: z.number().int().nonnegative().default(0), usageLimit: z.number().int().positive().optional().nullable(), perCustomerLimit: z.number().int().positive().default(1), startsAt: z.string().datetime().optional(), endsAt: z.string().datetime().optional().nullable(), audience: z.enum(['ALL', 'NEW_CUSTOMER', 'REPEAT_CUSTOMER', 'MEMBERS']).default('ALL'), vendorId: z.string().uuid().optional().nullable(), categoryId: z.string().uuid().optional().nullable(), serviceZoneId: z.string().uuid().optional().nullable(), minOrders: z.number().int().nonnegative().default(0), minSpendPaise: z.number().int().nonnegative().default(0), membershipRequired: z.boolean().default(false), loyaltyMinPoints: z.number().int().nonnegative().default(0) }).parse(req.body);
        if (input.discountType === 'PERCENT' && input.discountValue > 100)
            throw new Error('INVALID_PERCENT_DISCOUNT');
        const r = await query(`INSERT INTO promotions(code,title,description,discount_type,discount_value,max_discount_paise,min_order_paise,usage_limit,per_customer_limit,starts_at,ends_at,created_by,audience,vendor_id,category_id,service_zone_id,min_orders,min_spend_paise,membership_required,loyalty_min_points) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,NOW()),$11::timestamptz,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`, [input.code, input.title, input.description ?? null, input.discountType, input.discountValue, input.maxDiscountPaise ?? null, input.minOrderPaise, input.usageLimit ?? null, input.perCustomerLimit, input.startsAt ?? null, input.endsAt ?? null, req.authUser.id, input.audience, input.vendorId ?? null, input.categoryId ?? null, input.serviceZoneId ?? null, input.minOrders, input.minSpendPaise, input.membershipRequired, input.loyaltyMinPoints]);
        await audit('CAMPAIGN_CREATED', 'promotions', r.rows[0].id, req.authUser.id, { code: input.code, audience: input.audience });
        res.status(201).json({ campaign: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/admin/campaigns/:id', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const id = z.string().uuid().parse(req.params.id);
        const input = z.object({ isActive: z.boolean().optional(), endsAt: z.string().datetime().optional().nullable(), membershipRequired: z.boolean().optional(), minOrders: z.number().int().nonnegative().optional(), minSpendPaise: z.number().int().nonnegative().optional(), loyaltyMinPoints: z.number().int().nonnegative().optional() }).strict().parse(req.body);
        const current = await query(`SELECT * FROM promotions WHERE id=$1`, [id]);
        if (!current.rows[0]) {
            res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });
            return;
        }
        const c = { ...current.rows[0], ...input };
        const r = await query(`UPDATE promotions SET is_active=$1,ends_at=$2,membership_required=$3,min_orders=$4,min_spend_paise=$5,loyalty_min_points=$6,updated_at=NOW() WHERE id=$7 RETURNING *`, [c.isActive, c.endsAt ?? null, c.membershipRequired, c.minOrders, c.minSpendPaise, c.loyaltyMinPoints, id]);
        await audit('CAMPAIGN_UPDATED', 'promotions', id, req.authUser.id, input);
        res.json({ campaign: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.get('/admin/vendor-analytics/:vendorId', requirePermission('VIEW_DASHBOARD'), async (req, res, next) => {
    try {
        const vendorId = z.string().uuid().parse(req.params.vendorId);
        const days = Math.min(90, Math.max(7, Number(req.query.days || 30)));
        const [summary, daily, customers, products] = await Promise.all([
            query(`SELECT COUNT(*)::int orders,COUNT(*) FILTER(WHERE status='DELIVERED')::int delivered,COALESCE(SUM(total_paise) FILTER(WHERE status NOT IN ('CANCELLED','REFUNDED')),0)::bigint gmv_paise,COALESCE(AVG(total_paise) FILTER(WHERE status='DELIVERED'),0)::bigint delivered_aov_paise,COALESCE(SUM(platform_fee_paise),0)::bigint platform_fee_paise FROM orders WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-($2::int-1)`, [vendorId, days]),
            query(`SELECT created_at::date day,COUNT(*)::int orders,COUNT(*) FILTER(WHERE status='DELIVERED')::int delivered,COALESCE(SUM(total_paise),0)::bigint gmv_paise FROM orders WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-($2::int-1) GROUP BY created_at::date ORDER BY day`, [vendorId, days]),
            query(`SELECT COUNT(DISTINCT customer_id)::int customers,COUNT(DISTINCT customer_id) FILTER(WHERE customer_id IN (SELECT customer_id FROM orders WHERE vendor_id=$1 AND status='DELIVERED' GROUP BY customer_id HAVING COUNT(*)>1))::int repeat_customers FROM orders WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-($2::int-1)`, [vendorId, days]),
            query(`SELECT p.id,p.name,COALESCE(SUM(oi.quantity),0)::int units,COALESCE(SUM(oi.line_total_paise),0)::bigint revenue_paise FROM products p LEFT JOIN order_items oi ON oi.product_id=p.id LEFT JOIN orders o ON o.id=oi.order_id AND o.vendor_id=$1 AND o.status='DELIVERED' AND o.created_at>=CURRENT_DATE-($2::int-1) WHERE p.vendor_id=$1 GROUP BY p.id ORDER BY revenue_paise DESC LIMIT 20`, [vendorId, days])
        ]);
        res.json({ vendorId, windowDays: days, summary: summary.rows[0], daily: daily.rows, customers: customers.rows[0], products: products.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.get('/vendor-plans', requireRoles('VENDOR_OWNER', 'VENDOR_STAFF', 'SUPER_ADMIN', 'ADMIN'), async (_req, res, next) => {
    try {
        const r = await query(`SELECT id,code,name,monthly_price_paise,features,is_active FROM vendor_plans WHERE is_active=true ORDER BY monthly_price_paise ASC`);
        res.json({ plans: r.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.get('/vendor-subscription', requireRoles('VENDOR_OWNER', 'VENDOR_STAFF', 'SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
    try {
        const r = await query(`SELECT vs.*,vp.code plan_code,vp.name plan_name,vp.monthly_price_paise FROM vendor_subscriptions vs JOIN vendors v ON v.id=vs.vendor_id JOIN vendor_plans vp ON vp.id=vs.plan_id WHERE v.owner_user_id=$1 ORDER BY vs.created_at DESC LIMIT 1`, [req.authUser.id]);
        res.json({ subscription: r.rows[0] ?? null, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/vendor-subscription/change-plan', requireRoles('VENDOR_OWNER'), async (req, res, next) => {
    try {
        const input = z.object({ planId: z.string().uuid() }).parse(req.body);
        const vendor = await query(`SELECT id FROM vendors WHERE owner_user_id=$1 LIMIT 1`, [req.authUser.id]);
        if (!vendor.rows[0]) {
            res.status(404).json({ error: 'VENDOR_NOT_FOUND' });
            return;
        }
        const plan = await query(`SELECT id,code,name,monthly_price_paise FROM vendor_plans WHERE id=$1 AND is_active=true`, [input.planId]);
        if (!plan.rows[0]) {
            res.status(404).json({ error: 'PLAN_NOT_FOUND' });
            return;
        }
        const active = await query(`SELECT id FROM vendor_subscriptions WHERE vendor_id=$1 AND status='ACTIVE' ORDER BY created_at DESC LIMIT 1`, [vendor.rows[0].id]);
        if (active.rows[0]) {
            res.status(409).json({ error: 'ACTIVE_SUBSCRIPTION_REQUIRES_PROVIDER_CHECKOUT', subscriptionId: active.rows[0].id, plan: plan.rows[0] });
            return;
        }
        const sub = await query(`INSERT INTO vendor_subscriptions(vendor_id,plan_id,status,starts_at) VALUES($1,$2,'PENDING',NOW()) RETURNING *`, [vendor.rows[0].id, input.planId]);
        await query(`INSERT INTO vendor_subscription_events(vendor_subscription_id,event_type,metadata) VALUES($1,'CHECKOUT_REQUIRED',$2)`, [sub.rows[0].id, JSON.stringify({ plan: plan.rows[0] })]);
        res.status(201).json({ subscription: sub.rows[0], nextAction: 'PROVIDER_CHECKOUT_REQUIRED', plan: plan.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.post('/admin/vendor-subscriptions/:id/provider-state', requirePermission('MANAGE_SETTLEMENTS'), async (req, res, next) => {
    try {
        const id = z.string().uuid().parse(req.params.id);
        const input = z.object({ status: z.enum(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'PENDING']), providerSubscriptionId: z.string().max(255).optional(), providerEventId: z.string().max(255).optional(), renewsAt: z.string().datetime().optional().nullable() }).parse(req.body);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (input.providerEventId) {
                const exists = await client.query(`SELECT id FROM vendor_subscription_events WHERE provider_event_id=$1`, [input.providerEventId]);
                if (exists.rows[0]) {
                    await client.query('COMMIT');
                    res.json({ ok: true, replayed: true });
                    return;
                }
            }
            const r = await client.query(`UPDATE vendor_subscriptions SET status=$1,provider_subscription_id=COALESCE($2,provider_subscription_id),renews_at=$3,updated_at=NOW(),cancelled_at=CASE WHEN $1='CANCELLED' THEN NOW() ELSE cancelled_at END WHERE id=$4 RETURNING *`, [input.status, input.providerSubscriptionId ?? null, input.renewsAt ?? null, id]);
            if (!r.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'SUBSCRIPTION_NOT_FOUND' });
                return;
            }
            await client.query(`INSERT INTO vendor_subscription_events(vendor_subscription_id,event_type,provider_event_id,metadata) VALUES($1,$2,$3,$4)`, [id, `PROVIDER_${input.status}`, input.providerEventId ?? null, JSON.stringify({ providerSubscriptionId: input.providerSubscriptionId ?? null })]);
            await client.query('COMMIT');
            await audit('VENDOR_SUBSCRIPTION_PROVIDER_STATE', 'vendor_subscriptions', id, req.authUser.id, input);
            res.json({ subscription: r.rows[0] });
        }
        catch (e) {
            await client.query('ROLLBACK');
            throw e;
        }
        finally {
            client.release();
        }
    }
    catch (e) {
        next(e);
    }
});
router.get('/admin/analytics', requirePermission('VIEW_DASHBOARD'), async (req, res, next) => {
    try {
        const days = Math.min(90, Math.max(1, Number(req.query.days || 30)));
        const [daily, customers, vendors, subscriptions, loyalty, referrals, commerce, memberships, campaigns] = await Promise.all([
            query(`SELECT created_at::date day,COUNT(*)::int orders,COALESCE(SUM(total_paise),0)::bigint gmv_paise,COALESCE(SUM(platform_fee_paise),0)::bigint platform_fee_paise,COUNT(*) FILTER(WHERE status='DELIVERED')::int delivered FROM orders WHERE created_at>=CURRENT_DATE-($1::int-1) GROUP BY created_at::date ORDER BY day`, [days]),
            query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at>=CURRENT_DATE-INTERVAL '30 days')::int new_30d FROM users WHERE role='CUSTOMER'`),
            query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='ACTIVE')::int active FROM vendors`),
            query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='ACTIVE')::int active,COALESCE(SUM(vp.monthly_price_paise) FILTER(WHERE vs.status='ACTIVE'),0)::bigint monthly_run_rate_paise FROM vendor_subscriptions vs JOIN vendor_plans vp ON vp.id=vs.plan_id`),
            query(`SELECT COALESCE(SUM(points),0)::bigint points,COALESCE(SUM(lifetime_earned),0)::bigint lifetime_earned FROM loyalty_accounts`),
            query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='REWARDED')::int rewarded FROM referral_events`),
            query(`WITH customer_orders AS (SELECT customer_id,COUNT(*) FILTER(WHERE status='DELIVERED') delivered FROM orders GROUP BY customer_id) SELECT COALESCE(AVG(total_paise) FILTER(WHERE status IN ('DELIVERED','PAID','COD_CONFIRMED')),0)::bigint avg_order_value_paise,COUNT(*) FILTER(WHERE status='DELIVERED')::int delivered_orders,COUNT(DISTINCT customer_id) FILTER(WHERE status='DELIVERED')::int purchasing_customers,COUNT(DISTINCT customer_id) FILTER(WHERE status='DELIVERED' AND customer_id IN (SELECT customer_id FROM customer_orders WHERE delivered>1))::int repeat_customers FROM orders WHERE created_at>=CURRENT_DATE-($1::int-1)`, [days]),
            query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE status='ACTIVE')::int active,COALESCE(SUM(mp.monthly_price_paise) FILTER(WHERE cm.status='ACTIVE'),0)::bigint mrr_paise FROM customer_memberships cm JOIN membership_plans mp ON mp.id=cm.plan_id`),
            query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE is_active)::int active,COALESCE(SUM(redemptions),0)::bigint redemptions FROM (SELECT p.id,p.is_active,COUNT(pr.id)::int redemptions FROM promotions p LEFT JOIN promotion_redemptions pr ON pr.promotion_id=p.id GROUP BY p.id) x`)
        ]);
        res.json({ windowDays: days, daily: daily.rows, customers: customers.rows[0], vendors: vendors.rows[0], subscriptions: subscriptions.rows[0], loyalty: loyalty.rows[0], referrals: referrals.rows[0], commerce: commerce.rows[0], memberships: memberships.rows[0], campaigns: campaigns.rows[0], mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
export default router;
