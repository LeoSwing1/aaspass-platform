import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { query, pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { commitInventoryForOrder } from '../services/commerce/inventory.js';
import { recordOrderEvent } from '../services/orders/events.js';
import { verifyDeliveryOtp, setDeliveryOtps, revealDeliveryOtp } from '../services/fulfillment/delivery-otp.js';
const router = Router();
router.use(requireAuth, requireRoles('DELIVERY_PARTNER', 'DELIVERY_MANAGER', 'OPERATIONS_ADMIN', 'SUPER_ADMIN', 'ADMIN'));
const statusSchema = z.enum(['OFFLINE', 'AVAILABLE', 'BUSY']);
const assignmentStatus = z.enum(['OFFERED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']);
const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (n) => n * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function resolvePartnerId(userId) {
    if (userId.startsWith('dev-'))
        return null;
    const r = await query('SELECT id FROM delivery_partners WHERE user_id=$1 LIMIT 1', [userId]);
    return r.rows[0]?.id ?? null;
}
router.get('/me', async (req, res, next) => {
    try {
        const id = await resolvePartnerId(req.authUser.id);
        if (!id) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const r = await query(`SELECT id,status,mode,kyc_status,latitude,longitude,last_seen_at,created_at FROM delivery_partners WHERE id=$1`, [id]);
        if (!r.rows[0]) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        res.json({ deliveryPartner: r.rows[0], mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/status', async (req, res, next) => {
    try {
        const status = statusSchema.parse(req.body.status);
        const id = await resolvePartnerId(req.authUser.id);
        if (!id) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const r = await query(`UPDATE delivery_partners SET status=$1,last_seen_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING id,status,updated_at`, [status, id]);
        await audit('DELIVERY_PARTNER_STATUS', 'delivery_partners', id, req.authUser.id, { status });
        res.json({ deliveryPartner: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.post('/location', async (req, res, next) => {
    try {
        const input = locationSchema.parse(req.body);
        const id = await resolvePartnerId(req.authUser.id);
        if (!id) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const r = await query(`UPDATE delivery_partners SET latitude=$1,longitude=$2,last_seen_at=NOW(),updated_at=NOW() WHERE id=$3 RETURNING id,latitude,longitude,last_seen_at`, [input.latitude, input.longitude, id]);
        res.json({ location: r.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
router.get('/jobs', async (req, res, next) => {
    try {
        const lat = Number(req.query.latitude);
        const lon = Number(req.query.longitude);
        const radiusKm = Math.min(Math.max(Number(req.query.radiusKm ?? 5), 0.5), 15);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            res.status(400).json({ error: 'LOCATION_REQUIRED' });
            return;
        }
        const r = await query(`SELECT da.id,da.order_id,da.status,da.pickup_latitude,da.pickup_longitude,da.drop_latitude,da.drop_longitude,v.name AS vendor_name,v.address_line1 AS pickup_address,o.delivery_address_id,o.total_paise,o.delivery_fee_paise
    FROM delivery_assignments da
    JOIN orders o ON o.id=da.order_id
    JOIN vendors v ON v.id=o.vendor_id
    WHERE da.status='OFFERED' AND o.status IN ('READY_FOR_PICKUP','DELIVERY_ASSIGNED')
    ORDER BY da.created_at ASC LIMIT 100`);
        const jobs = r.rows.map((row) => {
            const distanceKm = row.pickup_latitude == null || row.pickup_longitude == null ? null : haversineKm(lat, lon, Number(row.pickup_latitude), Number(row.pickup_longitude));
            return { ...row, distanceKm, estimated_earning_paise: Math.max(500, Number(row.delivery_fee_paise ?? 0) * 70), estimatedEarningPaise: Math.max(500, Number(row.delivery_fee_paise ?? 0) * 70) };
        }).filter((job) => job.distanceKm == null || job.distanceKm <= radiusKm);
        res.json({ jobs, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
router.post('/assignments/:id/accept', async (req, res, next) => {
    try {
        const assignmentId = z.string().uuid().parse(req.params.id);
        const partnerId = await resolvePartnerId(req.authUser.id);
        if (!partnerId) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        if (!pool) {
            throw new Error('DATABASE_POOL_UNAVAILABLE');
        }
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const current = await client.query(`SELECT id,order_id,status FROM delivery_assignments WHERE id=$1 FOR UPDATE`, [assignmentId]);
            if (!current.rows[0]) {
                await client.query('ROLLBACK');
                res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
                return;
            }
            if (current.rows[0].status !== 'OFFERED') {
                await client.query('ROLLBACK');
                res.status(409).json({ error: 'ASSIGNMENT_NOT_AVAILABLE', status: current.rows[0].status });
                return;
            }
            const updated = await client.query(`UPDATE delivery_assignments SET delivery_partner_id=$1,status='ACCEPTED',accepted_at=NOW(),offer_expires_at=NULL,updated_at=NOW() WHERE id=$2 RETURNING *`, [partnerId, assignmentId]);
            await client.query(`UPDATE delivery_assignment_offers SET status='ACCEPTED',responded_at=NOW() WHERE assignment_id=$1 AND delivery_partner_id=$2 AND status='OFFERED'`, [assignmentId, partnerId]);
            await client.query(`UPDATE orders SET status='DELIVERY_ASSIGNED',delivery_assigned_at=COALESCE(delivery_assigned_at,NOW()),updated_at=NOW() WHERE id=$1 AND status IN ('READY_FOR_PICKUP','DELIVERY_ASSIGNED')`, [current.rows[0].order_id]);
            await client.query('COMMIT');
            await setDeliveryOtps(assignmentId);
            await recordOrderEvent({ orderId: current.rows[0].order_id, eventType: 'DELIVERY_ASSIGNED', source: 'DELIVERY_APP', actorUserId: req.authUser.id, payload: { partnerId } });
            await query(`UPDATE delivery_partners SET status='BUSY',last_seen_at=NOW(),updated_at=NOW() WHERE id=$1`, [partnerId]);
            await audit('DELIVERY_ASSIGNMENT_ACCEPTED', 'delivery_assignments', assignmentId, req.authUser.id, { partnerId, orderId: current.rows[0].order_id });
            res.json({ assignment: updated.rows[0] });
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
router.get('/assignments/:id/pickup-code', async (req, res, next) => {
    try {
        const assignmentId = z.string().uuid().parse(req.params.id);
        const partnerId = await resolvePartnerId(req.authUser.id);
        if (!partnerId) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const row = await query(`SELECT id,status FROM delivery_assignments WHERE id=$1 AND delivery_partner_id=$2 LIMIT 1`, [assignmentId, partnerId]);
        if (!row.rows[0]) {
            res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
            return;
        }
        const code = await revealDeliveryOtp(assignmentId, 'PICKUP');
        if (!code) {
            res.status(409).json({ error: 'PICKUP_CODE_NOT_READY' });
            return;
        }
        res.json({ assignmentId, pickupCode: code });
    }
    catch (e) {
        next(e);
    }
});
router.post('/assignments/:id/verify-otp', async (req, res, next) => {
    try {
        const assignmentId = z.string().uuid().parse(req.params.id);
        const stage = z.enum(['PICKUP', 'DROP']).parse(req.body.stage);
        const otp = z.string().regex(/^\d{6}$/).parse(req.body.otp);
        const partnerId = await resolvePartnerId(req.authUser.id);
        if (!partnerId) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const owner = await query(`SELECT id FROM delivery_assignments WHERE id=$1 AND delivery_partner_id=$2 LIMIT 1`, [assignmentId, partnerId]);
        if (!owner.rows[0]) {
            res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
            return;
        }
        const ok = await verifyDeliveryOtp(assignmentId, stage, otp);
        if (!ok) {
            res.status(401).json({ error: 'INVALID_OTP' });
            return;
        }
        res.json({ verified: true, stage });
    }
    catch (e) {
        next(e);
    }
});
router.post('/assignments/:id/proof', async (req, res, next) => {
    try {
        const assignmentId = z.string().uuid().parse(req.params.id);
        const partnerId = await resolvePartnerId(req.authUser.id);
        const input = z.object({ type: z.enum(['PICKUP', 'DROP']), photoUrl: z.string().url().optional(), note: z.string().trim().max(500).optional() }).parse(req.body);
        if (!partnerId) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const row = await query(`SELECT id,proof FROM delivery_assignments WHERE id=$1 AND delivery_partner_id=$2 LIMIT 1`, [assignmentId, partnerId]);
        if (!row.rows[0]) {
            res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
            return;
        }
        const previous = typeof row.rows[0].proof === 'object' && row.rows[0].proof ? row.rows[0].proof : {};
        const proof = { ...previous, [input.type.toLowerCase()]: { photoUrl: input.photoUrl ?? null, note: input.note ?? null, recordedAt: new Date().toISOString() } };
        const updated = await query(`UPDATE delivery_assignments SET proof=$1,updated_at=NOW() WHERE id=$2 AND delivery_partner_id=$3 RETURNING id,proof,updated_at`, [JSON.stringify(proof), assignmentId, partnerId]);
        await audit('DELIVERY_PROOF_RECORDED', 'delivery_assignments', assignmentId, req.authUser.id, { type: input.type });
        res.json({ assignment: updated.rows[0] });
    }
    catch (e) {
        next(e);
    }
});
const nextMap = {
    ACCEPTED: { next: 'PICKED_UP', order: 'PICKED_UP' },
    PICKED_UP: { next: 'OUT_FOR_DELIVERY', order: 'OUT_FOR_DELIVERY' },
    OUT_FOR_DELIVERY: { next: 'DELIVERED', order: 'DELIVERED' }
};
router.post('/assignments/:id/status', async (req, res, next) => {
    const client = await pool.connect();
    try {
        const assignmentId = z.string().uuid().parse(req.params.id);
        const requested = assignmentStatus.parse(req.body.status);
        const partnerId = await resolvePartnerId(req.authUser.id);
        if (!partnerId) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const current = await client.query(`SELECT id,order_id,status::text FROM delivery_assignments WHERE id=$1 AND delivery_partner_id=$2 FOR UPDATE`, [assignmentId, partnerId]);
        if (!current.rows[0]) {
            res.status(404).json({ error: 'ASSIGNMENT_NOT_FOUND' });
            return;
        }
        const allowed = nextMap[current.rows[0].status];
        if (!allowed || allowed.next !== requested) {
            res.status(409).json({ error: 'INVALID_DELIVERY_TRANSITION', from: current.rows[0].status, to: requested });
            return;
        }
        if (requested === 'PICKED_UP' || requested === 'DELIVERED') {
            const stage = requested === 'PICKED_UP' ? 'PICKUP' : 'DROP';
            const otp = z.string().regex(/^\d{6}$/).parse(req.body.otp);
            const verified = await verifyDeliveryOtp(assignmentId, stage, otp);
            if (!verified) {
                res.status(401).json({ error: 'INVALID_OTP', stage });
                return;
            }
        }
        await client.query('BEGIN');
        const timestampColumn = requested === 'PICKED_UP' ? 'picked_up_at' : requested === 'DELIVERED' ? 'delivered_at' : null;
        const sql = timestampColumn
            ? `UPDATE delivery_assignments SET status=$1,${timestampColumn}=NOW(),updated_at=NOW() WHERE id=$2 AND delivery_partner_id=$3 RETURNING *`
            : `UPDATE delivery_assignments SET status=$1,updated_at=NOW() WHERE id=$2 AND delivery_partner_id=$3 RETURNING *`;
        const r = await client.query(sql, [requested, assignmentId, partnerId]);
        const orderTimestamp = requested === 'DELIVERED' ? ',delivered_at=NOW()' : '';
        await client.query(`UPDATE orders SET status=$1${orderTimestamp},updated_at=NOW() WHERE id=$2`, [allowed.order, current.rows[0].order_id]);
        if (requested === 'DELIVERED') {
            await commitInventoryForOrder(client, current.rows[0].order_id);
            await client.query(`UPDATE delivery_partners SET status='AVAILABLE',last_seen_at=NOW(),updated_at=NOW() WHERE id=$1`, [partnerId]);
        }
        await client.query('COMMIT');
        await recordOrderEvent({ orderId: current.rows[0].order_id, eventType: allowed.order, source: 'DELIVERY_APP', actorUserId: req.authUser.id, payload: { partnerId } });
        await audit('DELIVERY_ASSIGNMENT_STATUS', 'delivery_assignments', assignmentId, req.authUser.id, { partnerId, status: requested, orderId: current.rows[0].order_id });
        res.json({ assignment: r.rows[0] });
    }
    catch (e) {
        await client.query('ROLLBACK').catch(() => { });
        next(e);
    }
    finally {
        client.release();
    }
});
router.get('/earnings', async (req, res, next) => {
    try {
        const partnerId = await resolvePartnerId(req.authUser.id);
        if (!partnerId) {
            res.status(404).json({ error: 'DELIVERY_PARTNER_NOT_FOUND' });
            return;
        }
        const rows = await query(`SELECT da.order_id,da.delivered_at,da.delivery_partner_id,o.delivery_fee_paise,COALESCE((da.proof->>'earning_paise')::bigint, GREATEST(500, FLOOR(o.delivery_fee_paise*0.7))) AS earning_paise,COALESCE((da.proof->>'bonus_paise')::bigint,0) AS bonus_paise
    FROM delivery_assignments da JOIN orders o ON o.id=da.order_id WHERE da.delivery_partner_id=$1 AND da.status='DELIVERED' ORDER BY da.delivered_at DESC LIMIT 100`, [partnerId]);
        const total = rows.rows.reduce((a, b) => a + Number(b.earning_paise) + Number(b.bonus_paise), 0);
        const today = rows.rows.filter((r) => r.delivered_at && new Date(r.delivered_at).toDateString() === new Date().toDateString()).reduce((a, b) => a + Number(b.earning_paise) + Number(b.bonus_paise), 0);
        res.json({ summary: { todayPaise: today, thisWeekPaise: total, totalPaise: total, pendingPayoutPaise: total }, transactions: rows.rows, mode: 'database' });
    }
    catch (e) {
        next(e);
    }
});
export default router;
