import { query } from '../../db/pool.js';
import { assignNearestDeliveryPartner } from './dispatch.js';
import { queueNotification } from '../notifications/service.js';
import { recordOrderEvent } from '../orders/events.js';
import { syncProviderRefund } from '../payment/refunds.js';
export async function runFulfillmentAutomation() {
    let expiredOffers = 0;
    let dispatchAttempts = 0;
    let assigned = 0;
    let failed = 0;
    let refundsSynced = 0;
    const expired = await query(`
    SELECT id,order_id,delivery_partner_id FROM delivery_assignments
    WHERE status='OFFERED' AND offer_expires_at IS NOT NULL AND offer_expires_at < NOW()
    ORDER BY offer_expires_at ASC LIMIT 100
  `);
    for (const row of expired.rows) {
        expiredOffers++;
        await query(`UPDATE delivery_assignment_offers SET status='EXPIRED',responded_at=NOW(),reason='OFFER_TIMEOUT' WHERE assignment_id=$1 AND status='OFFERED'`, [row.id]);
        await query(`UPDATE delivery_assignments SET status='CANCELLED',delivery_partner_id=NULL,reassignment_count=reassignment_count+1,updated_at=NOW() WHERE id=$1 AND status='OFFERED'`, [row.id]);
        await query(`UPDATE orders SET status='READY_FOR_PICKUP',delivery_assigned_at=NULL,updated_at=NOW() WHERE id=$1 AND status='DELIVERY_ASSIGNED'`, [row.order_id]);
        if (row.delivery_partner_id)
            await query(`UPDATE delivery_partners SET status='AVAILABLE',updated_at=NOW() WHERE id=$1 AND status='ASSIGNED'`, [row.delivery_partner_id]);
        await recordOrderEvent({ orderId: row.order_id, eventType: 'DELIVERY_OFFER_EXPIRED', source: 'FULFILLMENT_WORKER', payload: { assignmentId: row.id } });
    }
    const pending = await query(`
    SELECT id FROM orders
    WHERE status='READY_FOR_PICKUP'
      AND NOT EXISTS(SELECT 1 FROM delivery_assignments da WHERE da.order_id=orders.id AND da.status IN ('OFFERED','ACCEPTED','PICKED_UP','OUT_FOR_DELIVERY'))
    ORDER BY ready_for_pickup_at ASC NULLS LAST,created_at ASC LIMIT 50
  `);
    for (const row of pending.rows) {
        dispatchAttempts++;
        try {
            const result = await assignNearestDeliveryPartner(row.id);
            if (result.assigned)
                assigned++;
            else
                failed++;
        }
        catch {
            failed++;
        }
    }
    const pendingRefunds = await query(`SELECT id FROM refunds WHERE status IN ('PENDING','PROCESSING') AND provider='CASHFREE' AND provider_ref IS NOT NULL ORDER BY created_at ASC LIMIT 50`);
    for (const refund of pendingRefunds.rows) {
        try {
            await syncProviderRefund(refund.id);
            refundsSynced++;
        }
        catch { }
    }
    return { expiredOffers, dispatchAttempts, assigned, failed, refundsSynced };
}
export async function runSlaAutomation() {
    const policies = await query(`SELECT status,max_minutes,escalation_level FROM order_sla_policies WHERE is_active=true`);
    let breaches = 0;
    let notifications = 0;
    for (const policy of policies.rows) {
        const rows = await query(`
      SELECT o.id,o.customer_id,v.owner_user_id AS vendor_owner_user_id,o.status::text,
             FLOOR(EXTRACT(EPOCH FROM (NOW()-COALESCE(
               CASE o.status::text
                 WHEN 'PAID' THEN o.updated_at
                 WHEN 'COD_CONFIRMED' THEN o.updated_at
                 WHEN 'VENDOR_ACCEPTED' THEN o.vendor_accepted_at
                 WHEN 'PREPARING' THEN o.preparing_at
                 WHEN 'READY_FOR_PICKUP' THEN o.ready_for_pickup_at
                 WHEN 'DELIVERY_ASSIGNED' THEN o.delivery_assigned_at
                 WHEN 'PICKED_UP' THEN o.updated_at
                 WHEN 'OUT_FOR_DELIVERY' THEN o.updated_at
                 ELSE o.updated_at END,o.updated_at)))/60)::int age_minutes
      FROM orders o JOIN vendors v ON v.id=o.vendor_id
      WHERE o.status=$1 AND NOW()-COALESCE(
        CASE o.status::text
          WHEN 'VENDOR_ACCEPTED' THEN o.vendor_accepted_at
          WHEN 'PREPARING' THEN o.preparing_at
          WHEN 'READY_FOR_PICKUP' THEN o.ready_for_pickup_at
          WHEN 'DELIVERY_ASSIGNED' THEN o.delivery_assigned_at
          ELSE o.updated_at END,o.updated_at) > ($2::int * INTERVAL '1 minute')
      ORDER BY o.updated_at ASC LIMIT 100
    `, [policy.status, policy.max_minutes]);
        for (const row of rows.rows) {
            breaches++;
            const upsert = await query(`
        INSERT INTO order_sla_breaches(order_id,status,escalation_level,age_minutes)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(order_id,status) DO UPDATE SET age_minutes=EXCLUDED.age_minutes
        RETURNING id,last_notified_at
      `, [row.id, row.status, policy.escalation_level, row.age_minutes]);
            const breach = upsert.rows[0];
            const shouldNotify = !breach?.last_notified_at || (Date.now() - new Date(breach.last_notified_at).getTime() > 15 * 60 * 1000);
            if (!shouldNotify)
                continue;
            await query(`UPDATE order_sla_breaches SET last_notified_at=NOW() WHERE id=$1`, [breach.id]);
            const title = `AasPass ${policy.escalation_level} SLA alert`;
            const body = `Order ${row.id.slice(0, 8)}… has remained ${row.status.replaceAll('_', ' ')} for ${row.age_minutes} minutes.`;
            await queueNotification({ userId: row.customer_id, channel: 'PUSH', title: 'AasPass order delay', body: 'Your order is taking longer than expected. Our operations team has been alerted.', data: { type: 'SLA_ALERT', orderId: row.id, status: row.status } });
            if (row.vendor_owner_user_id)
                await queueNotification({ userId: row.vendor_owner_user_id, channel: 'PUSH', title, body, data: { type: 'SLA_ALERT', orderId: row.id, status: row.status } });
            notifications++;
            await recordOrderEvent({ orderId: row.id, eventType: 'SLA_BREACH', source: 'SLA_WORKER', payload: { status: row.status, ageMinutes: row.age_minutes, level: policy.escalation_level }, notify: false });
        }
    }
    await query(`UPDATE order_sla_breaches b SET resolved_at=NOW() WHERE resolved_at IS NULL AND EXISTS(SELECT 1 FROM orders o WHERE o.id=b.order_id AND o.status::text<>b.status)`);
    return { breaches, notifications };
}
