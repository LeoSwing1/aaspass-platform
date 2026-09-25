import { query, pool } from '../../db/pool.js';
import { recordOrderEvent } from '../orders/events.js';
import { queueNotification } from '../notifications/service.js';

export async function assignNearestDeliveryPartner(orderId: string): Promise<{ assigned: boolean; assignmentId?: string; partnerId?: string }> {
  if (!pool) throw new Error('DATABASE_POOL_UNAVAILABLE');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const order = await client.query<{
      id: string; status: string; vendor_id: string; customer_id: string; delivery_address_id: string | null;
      vendor_latitude: number | null; vendor_longitude: number | null;
      drop_latitude: number | null; drop_longitude: number | null; delivery_fee_paise: string;
    }>(`
      SELECT o.id,o.status::text,o.vendor_id,o.customer_id,o.delivery_address_id,
             v.latitude AS vendor_latitude,v.longitude AS vendor_longitude,
             a.latitude AS drop_latitude,a.longitude AS drop_longitude,
             o.delivery_fee_paise
      FROM orders o
      JOIN vendors v ON v.id=o.vendor_id
      LEFT JOIN addresses a ON a.id=o.delivery_address_id
      WHERE o.id=$1
      FOR UPDATE OF o
      LIMIT 1
    `, [orderId]);
    const row = order.rows[0];
    if (!row) { await client.query('ROLLBACK'); return { assigned: false }; }
    if (!['READY_FOR_PICKUP','DELIVERY_ASSIGNED'].includes(row.status)) {
      await client.query('ROLLBACK');
      return { assigned: false };
    }

    const existing = await client.query<{ id:string; delivery_partner_id:string|null }>(
      `SELECT id,delivery_partner_id FROM delivery_assignments WHERE order_id=$1 FOR UPDATE`, [orderId]
    );
    if (existing.rows[0]?.delivery_partner_id) {
      await client.query('COMMIT');
      return { assigned: true, assignmentId: existing.rows[0].id, partnerId: existing.rows[0].delivery_partner_id };
    }

    if (row.vendor_latitude == null || row.vendor_longitude == null) {
      await client.query('ROLLBACK');
      return { assigned: false };
    }

    const candidates = await client.query<{
      id:string; user_id:string; latitude:number|null; longitude:number|null; mode:string|null;
    }>(`
      SELECT id,user_id,latitude,longitude,mode
      FROM delivery_partners
      WHERE status='AVAILABLE' AND kyc_status='VERIFIED' AND latitude IS NOT NULL AND longitude IS NOT NULL
      ORDER BY last_seen_at DESC NULLS LAST
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    `);
    if (!candidates.rows.length) {
      await client.query('ROLLBACK');
      return { assigned: false };
    }

    const hav = (lat1:number,lon1:number,lat2:number,lon2:number) => {
      const r=6371; const rad=(n:number)=>n*Math.PI/180;
      const dLat=rad(lat2-lat1), dLon=rad(lon2-lon1);
      const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
      return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
    };
    const ranked = candidates.rows.map(c => ({ ...c, distanceKm: hav(row.vendor_latitude!, row.vendor_longitude!, Number(c.latitude), Number(c.longitude)) }))
      .sort((a,b)=>a.distanceKm-b.distanceKm);
    const best = ranked[0]!;
    const existingAssignment = existing.rows[0];
    const assignment = existingAssignment
      ? await client.query<{id:string}>(`UPDATE delivery_assignments SET delivery_partner_id=$1,status='OFFERED',offer_expires_at=NOW()+INTERVAL '90 seconds',updated_at=NOW() WHERE id=$2 RETURNING id`, [best.id, existingAssignment.id])
      : await client.query<{id:string}>(`INSERT INTO delivery_assignments(order_id,delivery_partner_id,status,pickup_latitude,pickup_longitude,drop_latitude,drop_longitude,earning_paise,offer_expires_at) VALUES($1,$2,'OFFERED',$3,$4,$5,$6,$7,NOW()+INTERVAL '90 seconds') RETURNING id`, [orderId,best.id,row.vendor_latitude,row.vendor_longitude,row.drop_latitude,row.drop_longitude,Math.max(500,Math.floor(Number(row.delivery_fee_paise)*0.7))]);
    const assignmentId = assignment.rows[0]!.id;
    await client.query(`INSERT INTO delivery_assignment_offers(assignment_id,delivery_partner_id,status,distance_km) VALUES($1,$2,'OFFERED',$3)`, [assignmentId,best.id,best.distanceKm]);
    await client.query(`UPDATE orders SET status='DELIVERY_ASSIGNED',delivery_assigned_at=COALESCE(delivery_assigned_at,NOW()),updated_at=NOW() WHERE id=$1`, [orderId]);
    await client.query(`UPDATE delivery_partners SET status='ASSIGNED',updated_at=NOW() WHERE id=$1`, [best.id]);
    await client.query(`INSERT INTO integration_outbox(event_type,aggregate_type,aggregate_id,payload) VALUES('DELIVERY_ASSIGNMENT_OFFERED','ORDER',$1,$2)`, [orderId, JSON.stringify({assignmentId,partnerId:best.id})]);
    await client.query('COMMIT');

    await recordOrderEvent({orderId,eventType:'DELIVERY_ASSIGNED',source:'DISPATCH_ENGINE',payload:{assignmentId,partnerId:best.id,distanceKm:best.distanceKm}});
    await queueNotification({ userId: best.user_id, channel:'PUSH', title:'New AasPass delivery', body:`A nearby delivery is available. Order ${orderId.slice(0,8)}…`, data:{type:'DELIVERY_ASSIGNMENT',orderId,assignmentId}, dispatchNow:true });
    return { assigned:true, assignmentId, partnerId:best.id };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}
