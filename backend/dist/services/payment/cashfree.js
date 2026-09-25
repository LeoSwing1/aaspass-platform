import crypto from 'node:crypto';
import { env } from '../../config/env.js';
export function cashfreeConfigured() {
    return Boolean(env.CASHFREE_CLIENT_ID && env.CASHFREE_CLIENT_SECRET);
}
function baseUrl() {
    return env.CASHFREE_MODE === 'production'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';
}
export async function createCashfreeOrder(input) {
    if (!cashfreeConfigured())
        throw new Error('CASHFREE_NOT_CONFIGURED');
    const response = await fetch(`${baseUrl()}/orders`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-version': env.CASHFREE_API_VERSION,
            'x-client-id': env.CASHFREE_CLIENT_ID,
            'x-client-secret': env.CASHFREE_CLIENT_SECRET,
            'x-request-id': `aaspass-${input.orderId}`,
        },
        body: JSON.stringify({
            order_id: input.orderId,
            order_amount: Number((input.amountPaise / 100).toFixed(2)),
            order_currency: 'INR',
            customer_details: {
                customer_id: input.customerId,
                customer_phone: input.customerPhone,
                customer_name: input.customerName ?? 'AasPass Customer',
                customer_email: input.customerEmail ?? undefined,
            },
            order_meta: {
                return_url: input.returnUrl,
                notify_url: input.notifyUrl,
            },
        }),
    });
    const raw = await response.json();
    if (!response.ok) {
        throw new Error(`CASHFREE_CREATE_ORDER_FAILED:${response.status}:${JSON.stringify(raw)}`);
    }
    const data = raw;
    if (!data.order_id || !data.payment_session_id) {
        throw new Error('CASHFREE_CREATE_ORDER_MISSING_SESSION');
    }
    return { orderId: data.order_id, paymentSessionId: data.payment_session_id, raw };
}
export async function getCashfreePayments(orderId) {
    if (!cashfreeConfigured())
        throw new Error('CASHFREE_NOT_CONFIGURED');
    const response = await fetch(`${baseUrl()}/orders/${encodeURIComponent(orderId)}/payments`, {
        headers: {
            'x-api-version': env.CASHFREE_API_VERSION,
            'x-client-id': env.CASHFREE_CLIENT_ID,
            'x-client-secret': env.CASHFREE_CLIENT_SECRET,
        },
    });
    const raw = await response.json();
    if (!response.ok)
        throw new Error(`CASHFREE_GET_PAYMENTS_FAILED:${response.status}:${JSON.stringify(raw)}`);
    return raw;
}
export function verifyCashfreeWebhook(rawBody, signature, timestamp) {
    if (!signature || !timestamp || !env.CASHFREE_CLIENT_SECRET)
        return false;
    const signed = `${timestamp}${rawBody}`;
    const expected = crypto.createHmac('sha256', env.CASHFREE_CLIENT_SECRET).update(signed).digest('base64');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
/**
 * Normalize Cashfree payment webhook payloads into the internal payment model.
 * Cashfree webhook shapes place the order/payment data under `data`, while
 * some provider/test payloads may expose the fields at the top level.
 */
export function parseCashfreePaymentEvent(event) {
    const data = isRecord(event.data) ? event.data : {};
    const order = isRecord(data.order) ? data.order : {};
    const payment = isRecord(data.payment) ? data.payment : {};
    const orderId = firstString(order.order_id, order.orderId, data.order_id, data.orderId, event.order_id, event.orderId);
    if (!orderId)
        return null;
    const rawStatus = firstString(payment.payment_status, payment.paymentStatus, payment.status, data.payment_status, data.paymentStatus, data.status, event.payment_status, event.paymentStatus, event.status)?.toUpperCase();
    let status = 'PENDING';
    if (rawStatus && ['SUCCESS', 'PAID', 'COMPLETED', 'CAPTURED'].includes(rawStatus)) {
        status = 'PAID';
    }
    else if (rawStatus && ['FAILED', 'CANCELLED', 'CANCELED', 'USER_DROPPED', 'EXPIRED'].includes(rawStatus)) {
        status = 'FAILED';
    }
    const rawAmount = firstValue(payment.payment_amount, payment.amount, data.payment_amount, data.amount, event.payment_amount, event.amount);
    const amountNumber = rawAmount == null ? NaN : Number(rawAmount);
    const amountPaise = Number.isFinite(amountNumber) ? Math.round(amountNumber * 100) : null;
    const providerPaymentId = firstString(payment.cf_payment_id, payment.payment_id, payment.cfPaymentId, data.cf_payment_id, data.payment_id, event.cf_payment_id, event.payment_id);
    return { orderId, status, amountPaise, providerPaymentId };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function firstString(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim())
            return value.trim();
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
    }
    return null;
}
function firstValue(...values) {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '')
            return value;
    }
    return null;
}
export const CASHFREE_MODE = env.CASHFREE_MODE;
