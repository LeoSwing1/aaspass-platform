import { query, pool } from '../../db/pool.js';
import { queueNotification } from '../notifications/service.js';
export async function publishDomainEvent(event) { const r = await query(`INSERT INTO integration_outbox(event_type,aggregate_type,aggregate_id,actor_user_id,payload,status) VALUES($1,$2,$3,$4,$5,'PENDING') RETURNING id`, [event.type, event.aggregateType, event.aggregateId, event.actorUserId ?? null, JSON.stringify(event.payload ?? {})]); return r.rows[0].id; }
async function handleEvent(type, aggregateId, payload) {
    if (type === 'ORDER_STATUS_CHANGED' && String(payload.status) === 'DELIVERED') {
        const r = await query(`SELECT customer_id FROM orders WHERE id=$1`, [aggregateId]);
        if (r.rows[0])
            await queueNotification({ userId: r.rows[0].customer_id, channel: 'PUSH', title: 'Thanks for shopping locally', body: 'Your AasPass order is complete. Your rewards and loyalty benefits are being updated.', data: { type: 'ORDER_DELIVERED', orderId: aggregateId } });
    }
    if (type === 'MEMBERSHIP_ACTIVATED') {
        const r = await query(`SELECT cm.user_id,mp.name plan_name FROM customer_memberships cm JOIN membership_plans mp ON mp.id=cm.plan_id WHERE cm.id=$1`, [aggregateId]);
        if (r.rows[0])
            await queueNotification({ userId: r.rows[0].user_id, channel: 'PUSH', title: 'AasPass Plus is active', body: `Your ${r.rows[0].plan_name} membership is now active. Benefits will apply automatically at checkout.`, data: { type: 'MEMBERSHIP', membershipId: aggregateId } });
    }
}
export async function dispatchIntegrationOutbox(limit = 100) { const c = await pool.connect(); let ids = []; try {
    await c.query('BEGIN');
    const r = await c.query(`SELECT id FROM integration_outbox WHERE status='PENDING' AND available_at<=NOW() ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $1`, [limit]);
    ids = r.rows.map(x => x.id);
    if (ids.length)
        await c.query(`UPDATE integration_outbox SET status='PROCESSING',attempts=attempts+1,updated_at=NOW() WHERE id=ANY($1::uuid[])`, [ids]);
    await c.query('COMMIT');
}
catch (e) {
    await c.query('ROLLBACK');
    throw e;
}
finally {
    c.release();
} let processed = 0, failed = 0; for (const id of ids) {
    try {
        const r = await query(`SELECT event_type,aggregate_id,payload FROM integration_outbox WHERE id=$1`, [id]);
        if (!r.rows[0])
            continue;
        await handleEvent(r.rows[0].event_type, r.rows[0].aggregate_id, r.rows[0].payload || {});
        await query(`UPDATE integration_outbox SET status='PROCESSED',processed_at=NOW(),updated_at=NOW(),last_error=NULL WHERE id=$1`, [id]);
        processed++;
    }
    catch (e) {
        failed++;
        const m = e instanceof Error ? e.message : 'Unknown error';
        await query(`UPDATE integration_outbox SET status=CASE WHEN attempts>=8 THEN 'FAILED' ELSE 'PENDING' END,available_at=NOW()+LEAST(attempts*30,600)*INTERVAL '1 second',last_error=$2,updated_at=NOW() WHERE id=$1`, [id, m]);
    }
} return { processed, failed }; }
