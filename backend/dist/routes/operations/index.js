import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import { query } from '../../db/pool.js';
import { audit } from '../../services/audit.js';
import { runFulfillmentAutomation, runSlaAutomation } from '../../services/fulfillment/automation.js';
import { requestRefund } from '../../services/payment/refunds.js';
const router = Router();
router.use(requireAuth, requirePermission('VIEW_DASHBOARD'));
router.get('/overview', async (_req, res, next) => {
    try {
        const [settings, launches, vendors, activeOrders, partners, tickets] = await Promise.all([
            query(`SELECT key,value,updated_at FROM platform_settings WHERE key IN ('year1_vendor_target','minimum_orders_per_vendor_day','pilot_city','pilot_stage') ORDER BY key`),
            query(`SELECT id,city,state,country,stage,status,target_vendors,target_orders_per_vendor_day,notes,created_at,updated_at FROM market_launches ORDER BY status='ACTIVE' DESC,city`),
            query(`SELECT COUNT(*)::text count, COUNT(*) FILTER (WHERE v.status='ACTIVE' AND EXISTS(SELECT 1 FROM products p WHERE p.vendor_id=v.id AND p.is_active=true))::text "withCatalog", COUNT(*) FILTER (WHERE v.status='ACTIVE' AND EXISTS(SELECT 1 FROM vendor_kyc k WHERE k.vendor_id=v.id AND k.status='VERIFIED'))::text verified FROM vendors v`),
            query(`SELECT COUNT(*)::text count FROM orders WHERE status NOT IN ('DELIVERED','CANCELLED','REFUNDED')`),
            query(`SELECT COUNT(*)::text count FROM delivery_partners WHERE status='AVAILABLE'`),
            query(`SELECT COUNT(*)::text count FROM support_tickets WHERE status NOT IN ('RESOLVED','CLOSED')`)
        ]);
        const launch = launches.rows[0] ?? null;
        const targetVendors = Number(settings.rows.find((x) => x.key === 'year1_vendor_target')?.value?.value ?? 10000);
        const density = Number(settings.rows.find((x) => x.key === 'minimum_orders_per_vendor_day')?.value?.value ?? 100);
        const activeVendors = Number(vendors.rows[0]?.count ?? 0);
        res.json({ targets: { year1Vendors: targetVendors, minOrdersPerVendorDay: density, targetOrdersPerDay: targetVendors * density }, launches: launches.rows, activeLaunch: launch, network: { vendors: activeVendors, vendorsWithCatalog: Number(vendors.rows[0]?.withCatalog ?? 0), vendorsKycVerified: Number(vendors.rows[0]?.verified ?? 0), activeOrders: Number(activeOrders.rows[0]?.count ?? 0), availableDeliveryPartners: Number(partners.rows[0]?.count ?? 0), openTickets: Number(tickets.rows[0]?.count ?? 0) } });
    }
    catch (e) {
        next(e);
    }
});
const launchSchema = z.object({ city: z.string().trim().min(2).max(120), state: z.string().trim().min(2).max(120), country: z.string().trim().min(2).max(120).default('India'), stage: z.enum(['PLANNED', 'PILOT', 'EXPANSION', 'SCALE']).default('PLANNED'), status: z.enum(['PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED']).default('PLANNED'), targetVendors: z.number().int().min(0), targetOrdersPerVendorDay: z.number().int().min(1).default(100), notes: z.string().max(2000).optional().nullable() });
router.post('/launches', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const input = launchSchema.parse(req.body);
        const r = await query(`INSERT INTO market_launches(city,state,country,stage,status,target_vendors,target_orders_per_vendor_day,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(city,state,country) DO UPDATE SET stage=EXCLUDED.stage,status=EXCLUDED.status,target_vendors=EXCLUDED.target_vendors,target_orders_per_vendor_day=EXCLUDED.target_orders_per_vendor_day,notes=EXCLUDED.notes,updated_at=NOW() RETURNING *`, [input.city, input.state, input.country, input.stage, input.status, input.targetVendors, input.targetOrdersPerVendorDay, input.notes ?? null]);
        const row = r.rows[0];
        await audit('MARKET_LAUNCH_UPSERTED', 'market_launches', row.id, req.authUser.id, { city: input.city, state: input.state, status: input.status });
        res.status(201).json({ launch: row });
    }
    catch (e) {
        next(e);
    }
});
const settingSchema = z.object({ key: z.enum(['year1_vendor_target', 'minimum_orders_per_vendor_day', 'pilot_stage']), value: z.unknown() });
router.patch('/settings', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const input = settingSchema.parse(req.body);
        await query(`INSERT INTO platform_settings(key,value,updated_by,updated_at) VALUES($1,$2,$3,NOW()) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [input.key, JSON.stringify(input.value), req.authUser.id]);
        await audit('PLATFORM_SETTING_UPDATED', 'platform_settings', null, req.authUser.id, { key: input.key });
        res.json({ ok: true });
    }
    catch (e) {
        next(e);
    }
});
export default router;
router.post('/automation/run', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const [fulfillment, sla] = await Promise.all([runFulfillmentAutomation(), runSlaAutomation()]);
        await audit('OPERATIONS_AUTOMATION_RUN', 'operations', null, req.authUser.id, { fulfillment, sla });
        res.json({ fulfillment, sla });
    }
    catch (e) {
        next(e);
    }
});
router.get('/sla', requirePermission('VIEW_ORDERS'), async (_req, res, next) => {
    try {
        const [breaches, policies] = await Promise.all([
            query(`SELECT b.id,b.order_id,b.status,b.escalation_level,b.age_minutes,b.first_detected_at,b.last_notified_at,o.total_paise,o.customer_id,cp.customer_code,v.name vendor_name FROM order_sla_breaches b JOIN orders o ON o.id=b.order_id JOIN customer_profiles cp ON cp.user_id=o.customer_id JOIN vendors v ON v.id=o.vendor_id WHERE b.resolved_at IS NULL ORDER BY CASE b.escalation_level WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 ELSE 3 END,b.first_detected_at ASC LIMIT 200`),
            query(`SELECT status,max_minutes,escalation_level,is_active,updated_at FROM order_sla_policies ORDER BY max_minutes ASC`)
        ]);
        res.json({ breaches: breaches.rows, policies: policies.rows });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/sla/policies/:status', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const status = z.string().regex(/^[A-Z_]+$/).parse(req.params.status);
        const input = z.object({ maxMinutes: z.number().int().min(1).max(1440), escalationLevel: z.enum(['WARNING', 'HIGH', 'URGENT']), isActive: z.boolean().default(true) }).parse(req.body);
        const r = await query(`INSERT INTO order_sla_policies(status,max_minutes,escalation_level,is_active,updated_at) VALUES($1,$2,$3,$4,NOW()) ON CONFLICT(status) DO UPDATE SET max_minutes=EXCLUDED.max_minutes,escalation_level=EXCLUDED.escalation_level,is_active=EXCLUDED.is_active,updated_at=NOW() RETURNING *`, [status, input.maxMinutes, input.escalationLevel, input.isActive]);
        await audit('SLA_POLICY_UPDATED', 'order_sla_policies', null, req.authUser.id, { status, ...input });
        res.json({ policy: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.post('/refunds', requirePermission('APPROVE_REFUNDS'), async (req, res, next) => {
    try {
        const input = z.object({ orderId: z.string().uuid(), amountPaise: z.number().int().positive(), reason: z.string().trim().min(3).max(255), speed: z.enum(['STANDARD', 'INSTANT']).default('STANDARD') }).parse(req.body);
        const result = await requestRefund({ ...input, createdBy: req.authUser.id });
        await audit('REFUND_REQUESTED', 'refunds', result.id, req.authUser.id, { orderId: input.orderId, amountPaise: input.amountPaise, status: result.status });
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
router.get('/refunds', requirePermission('VIEW_SETTLEMENTS'), async (_req, res, next) => {
    try {
        const r = await query(`SELECT r.id,r.order_id,r.amount_paise,r.status,r.provider,r.provider_ref,r.reason,r.created_at,r.processed_at,cp.customer_code,u.name customer_name,v.name vendor_name FROM refunds r JOIN orders o ON o.id=r.order_id JOIN users u ON u.id=o.customer_id JOIN customer_profiles cp ON cp.user_id=u.id JOIN vendors v ON v.id=o.vendor_id ORDER BY r.created_at DESC LIMIT 200`);
        res.json({ refunds: r.rows });
    }
    catch (e) {
        next(e);
    }
});
router.get('/command-center', requirePermission('VIEW_DASHBOARD'), async (_req, res, next) => {
    try {
        const [orders, delivery, finance, webhooks, sla, events] = await Promise.all([
            query(`SELECT o.id,o.status,o.total_paise,o.created_at,cp.customer_code,u.name customer_name,v.name vendor_name,da.status delivery_status FROM orders o JOIN customer_profiles cp ON cp.user_id=o.customer_id JOIN users u ON u.id=o.customer_id JOIN vendors v ON v.id=o.vendor_id LEFT JOIN delivery_assignments da ON da.order_id=o.id WHERE o.status NOT IN ('DELIVERED','CANCELLED','REFUNDED') ORDER BY o.created_at DESC LIMIT 100`),
            query(`SELECT da.order_id,da.status,dp.id delivery_partner_id,u.name delivery_partner_name,o.status order_status FROM delivery_assignments da JOIN orders o ON o.id=da.order_id LEFT JOIN delivery_partners dp ON dp.id=da.delivery_partner_id LEFT JOIN users u ON u.id=dp.user_id WHERE da.status NOT IN ('DELIVERED','CANCELLED') ORDER BY da.updated_at DESC LIMIT 100`),
            query(`SELECT id,run_type,status,checked_count,matched_count,mismatch_count,started_at,finished_at FROM finance_reconciliation_runs ORDER BY started_at DESC LIMIT 10`),
            query(`SELECT provider,event_type,COUNT(*)::int count,MAX(received_at) latest FROM payment_webhook_events WHERE received_at>=NOW()-INTERVAL '24 hours' GROUP BY provider,event_type ORDER BY latest DESC LIMIT 50`),
            query(`SELECT b.id,b.order_id,b.status,b.escalation_level,b.age_minutes,b.first_detected_at FROM order_sla_breaches b WHERE b.resolved_at IS NULL ORDER BY b.first_detected_at ASC LIMIT 100`),
            query(`SELECT id,event_type,aggregate_type,aggregate_id,payload,created_at FROM integration_outbox ORDER BY created_at DESC LIMIT 30`)
        ]);
        res.json({ orders: orders.rows, delivery: delivery.rows, finance: finance.rows, webhooks: webhooks.rows, sla: sla.rows, events: events.rows, generatedAt: new Date().toISOString() });
    }
    catch (e) {
        next(e);
    }
});
router.get('/events/stream', requirePermission('VIEW_DASHBOARD'), async (req, res) => {
    res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    let last = '';
    const send = async () => { try {
        const r = await query(`SELECT id,event_type,aggregate_type,aggregate_id,payload,created_at FROM integration_outbox WHERE created_at>=NOW()-INTERVAL '5 minutes' ORDER BY created_at DESC LIMIT 30`);
        const rows = r.rows.filter((x) => x.id !== last);
        if (rows.length) {
            last = rows[0].id;
            res.write(`event: aaspass\ndata: ${JSON.stringify(rows)}\n\n`);
        }
        else
            res.write(': heartbeat\\n\\n');
    }
    catch {
        res.write(': error\\n\\n');
    } };
    await send();
    const timer = setInterval(() => void send(), 3000);
    req.on('close', () => clearInterval(timer));
});
router.post('/reconciliation/finance', requirePermission('VIEW_SETTLEMENTS'), async (req, res, next) => { try {
    const { reconcileFinance } = await import('../../services/finance/reconciliation.js');
    const result = await reconcileFinance(req.authUser.id);
    await audit('FINANCE_RECONCILIATION_RUN', 'finance_reconciliation_runs', result.runId, req.authUser.id, result);
    res.json(result);
}
catch (e) {
    next(e);
} });
router.post('/reconciliation/provider/cashfree', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => { try {
    const { reconcileCashfreePayments } = await import('../../services/finance/reconciliation.js');
    const result = await reconcileCashfreePayments(req.authUser.id);
    await audit('PROVIDER_RECONCILIATION_RUN', 'provider_reconciliation_runs', result.runId, req.authUser.id, result);
    res.json(result);
}
catch (e) {
    next(e);
} });
router.get('/reconciliation/runs', requirePermission('VIEW_SETTLEMENTS'), async (_req, res, next) => { try {
    const [finance, provider] = await Promise.all([query(`SELECT * FROM finance_reconciliation_runs ORDER BY started_at DESC LIMIT 20`), query(`SELECT * FROM provider_reconciliation_runs ORDER BY started_at DESC LIMIT 20`)]);
    res.json({ finance: finance.rows, provider: provider.rows });
}
catch (e) {
    next(e);
} });
router.get('/alerts', requirePermission('VIEW_DASHBOARD'), async (req, res, next) => {
    try {
        const status = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional().parse(req.query.status);
        const limit = z.coerce.number().int().min(1).max(500).default(200).parse(req.query.limit);
        const r = await query(`SELECT a.*,o.status order_status,v.name vendor_name,u.name target_user_name FROM operational_alerts a LEFT JOIN orders o ON o.id=a.order_id LEFT JOIN vendors v ON v.id=a.vendor_id LEFT JOIN users u ON u.id=a.target_user_id ${status ? 'WHERE a.status=$1' : ''} ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END,a.last_detected_at DESC LIMIT $${status ? 2 : 1}`, status ? [status, limit] : [limit]);
        res.json({ alerts: r.rows });
    }
    catch (e) {
        next(e);
    }
});
router.patch('/alerts/:id', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
    try {
        const id = z.string().uuid().parse(req.params.id);
        const input = z.object({ status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']) }).parse(req.body);
        const r = await query(`UPDATE operational_alerts SET status=$1,acknowledged_at=CASE WHEN $1='ACKNOWLEDGED' THEN COALESCE(acknowledged_at,NOW()) ELSE acknowledged_at END,resolved_at=CASE WHEN $1='RESOLVED' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$2 RETURNING *`, [input.status, id]);
        if (!r.rows[0]) {
            res.status(404).json({ error: 'ALERT_NOT_FOUND' });
            return;
        }
        await audit('OPERATIONAL_ALERT_STATUS_CHANGED', 'operational_alerts', id, req.authUser.id, { status: input.status });
        res.json({ alert: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.post('/alerts/run', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => { try {
    const { runOperationalAlertAutomation } = await import('../../services/operations/alerts.js');
    const result = await runOperationalAlertAutomation();
    await audit('OPERATIONAL_ALERT_AUTOMATION_RUN', 'operational_alerts', null, req.authUser.id, result);
    res.json(result);
}
catch (e) {
    next(e);
} });
router.get('/alerts', requirePermission('VIEW_DASHBOARD'), async (req, res, next) => { try {
    const status = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional().parse(req.query.status);
    const limit = z.coerce.number().int().min(1).max(500).default(200).parse(req.query.limit);
    const sql = `SELECT a.*,o.status order_status,v.name vendor_name,u.name target_user_name FROM operational_alerts a LEFT JOIN orders o ON o.id=a.order_id LEFT JOIN vendors v ON v.id=a.vendor_id LEFT JOIN users u ON u.id=a.target_user_id ${status ? 'WHERE a.status=$1' : ''} ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END,a.last_detected_at DESC LIMIT $${status ? 2 : 1}`;
    const r = await query(sql, status ? [status, limit] : [limit]);
    res.json({ alerts: r.rows });
}
catch (e) {
    next(e);
} });
router.patch('/alerts/:id', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => { try {
    const id = z.string().uuid().parse(req.params.id);
    const input = z.object({ status: z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']) }).parse(req.body);
    const r = await query(`UPDATE operational_alerts SET status=$1,acknowledged_at=CASE WHEN $1='ACKNOWLEDGED' THEN COALESCE(acknowledged_at,NOW()) ELSE acknowledged_at END,resolved_at=CASE WHEN $1='RESOLVED' THEN NOW() ELSE NULL END,updated_at=NOW() WHERE id=$2 RETURNING *`, [input.status, id]);
    if (!r.rows[0]) {
        res.status(404).json({ error: 'ALERT_NOT_FOUND' });
        return;
    }
    await audit('OPERATIONAL_ALERT_STATUS_CHANGED', 'operational_alerts', id, req.authUser.id, { status: input.status });
    res.json({ alert: r.rows[0] });
}
catch (e) {
    next(e);
} });
router.post('/alerts/run', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => { try {
    const { runOperationalAlertAutomation } = await import('../../services/operations/alerts.js');
    const result = await runOperationalAlertAutomation();
    await audit('OPERATIONAL_ALERT_AUTOMATION_RUN', 'operational_alerts', null, req.authUser.id, result);
    res.json(result);
}
catch (e) {
    next(e);
} });
