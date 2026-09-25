import { query } from '../../db/pool.js';
import { queueNotification } from '../notifications/service.js';
import { publishDomainEvent } from '../integrations/event-bus.js';
const customerMessages = {
    PLACED: ['Order placed', 'Your AasPass order has been placed.'],
    PAYMENT_PENDING: ['Payment required', 'Your AasPass order is waiting for payment.'],
    PAID: ['Payment confirmed', 'Your AasPass payment was successful.'],
    COD_CONFIRMED: ['Order placed', 'Your cash-on-delivery order is confirmed.'],
    VENDOR_ACCEPTED: ['Order accepted', 'Your local vendor accepted your order.'],
    PREPARING: ['Order being prepared', 'Your vendor is preparing your order.'],
    READY_FOR_PICKUP: ['Ready for pickup', 'Your order is ready and waiting for a delivery partner.'],
    DELIVERY_ASSIGNED: ['Delivery partner assigned', 'Your local delivery partner has been assigned.'],
    PICKED_UP: ['Order picked up', 'Your order is now on the way.'],
    OUT_FOR_DELIVERY: ['Out for delivery', 'Your AasPass order is on the way to you.'],
    DELIVERED: ['Delivered', 'Your AasPass order has been delivered.'],
    PAYMENT_FAILED: ['Payment failed', 'We could not confirm the payment for your order.'],
    CANCELLED: ['Order cancelled', 'Your AasPass order has been cancelled.'],
    REFUND_PENDING: ['Refund started', 'Your refund request has been started.'],
    REFUNDED: ['Refund completed', 'Your refund has been recorded by AasPass.'],
};
export async function recordOrderEvent(input) {
    await query(`INSERT INTO order_events(order_id,event_type,source,actor_user_id,payload) VALUES($1,$2,$3,$4,$5)`, [input.orderId, input.eventType, input.source, input.actorUserId ?? null, JSON.stringify(input.payload ?? {})]);
    await publishDomainEvent({ type: 'ORDER_STATUS_CHANGED', aggregateType: 'ORDER', aggregateId: input.orderId, actorUserId: input.actorUserId ?? null, payload: { status: input.eventType, source: input.source, ...(input.payload ?? {}) } });
    if (input.notify === false)
        return;
    const order = await query(`SELECT o.id,o.customer_id,v.owner_user_id,da.delivery_partner_id FROM orders o JOIN vendors v ON v.id=o.vendor_id LEFT JOIN delivery_assignments da ON da.order_id=o.id WHERE o.id=$1 LIMIT 1`, [input.orderId]);
    const row = order.rows[0];
    if (!row)
        return;
    const msg = customerMessages[input.eventType];
    if (msg)
        await queueNotification({ userId: row.customer_id, channel: 'PUSH', title: msg[0], body: `${msg[1]} Order ${String(row.id).slice(0, 8)}…`, data: { type: 'ORDER', orderId: row.id, status: input.eventType } });
    if (['PAID', 'COD_CONFIRMED'].includes(input.eventType) && row.owner_user_id)
        await queueNotification({ userId: row.owner_user_id, channel: 'PUSH', title: 'New AasPass order', body: `A new order ${String(row.id).slice(0, 8)}… is waiting in your store queue.`, data: { type: 'VENDOR_ORDER', orderId: row.id, status: input.eventType } });
    if (input.eventType === 'DELIVERY_ASSIGNED' && row.owner_user_id)
        await queueNotification({ userId: row.owner_user_id, channel: 'PUSH', title: 'Delivery partner assigned', body: `A delivery partner has been assigned to order ${String(row.id).slice(0, 8)}…`, data: { type: 'DELIVERY_ASSIGNED', orderId: row.id, status: input.eventType } });
}
