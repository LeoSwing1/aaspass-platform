import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import { cashfreeConfigured, createCashfreeOrder, getCashfreePayments, verifyCashfreeWebhook, parseCashfreePaymentEvent } from '../../services/payment/cashfree.js';
import { isWithinAasPassPilot } from '../../services/maps/serviceability.js';
import { estimateRoute } from '../../services/maps/route.js';
import { notificationsConfigured } from '../../services/notifications/provider.js';
import { dispatchPendingNotifications, queueNotification, whatsappConfigured } from '../../services/notifications/service.js';
import { recordOrderEvent } from '../../services/orders/events.js';
import { postPlatformRevenue } from '../../services/finance/ledger.js';
import { env } from '../../config/env.js';
import { query, pool } from '../../db/pool.js';
import { releaseInventoryForOrder } from '../../services/commerce/inventory.js';
import { creditWalletForRefund } from '../../services/commerce/wallet.js';

declare global { namespace Express { interface Request { rawBody?: string } } }

const router = Router();
const webhookRouter = Router();
router.use(requireAuth);

router.get('/status', requirePermission('MANAGE_SYSTEM_CONFIG'), (_req, res) => {
  res.json({
    cashfree: { configured: cashfreeConfigured(), mode: env.CASHFREE_MODE, apiVersion: env.CASHFREE_API_VERSION },
    maps: { provider: env.MAPS_PROVIDER, googleRoutesConfigured: Boolean(env.GOOGLE_ROUTES_API_KEY) },
    notifications: { fcmConfigured: notificationsConfigured(), whatsappConfigured: whatsappConfigured() },
    kyc: { provider: env.KYC_PROVIDER, configured: Boolean(env.KYC_API_KEY) },
    storage: { provider: env.STORAGE_PROVIDER, configured: Boolean(env.STORAGE_BUCKET) },
  });
});

router.post('/serviceability/check', async (req, res) => {
  const input = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).parse(req.body);
  const result = isWithinAasPassPilot(input);
  res.json({ ...result, mode: 'pilot-config' });
});

router.post('/payments/session', async (req, res, next) => {
  try {
    const input = z.object({ orderId: z.string().uuid(), returnUrl: z.string().url(), notifyUrl: z.string().url() }).parse(req.body);
    if (!cashfreeConfigured()) { res.status(503).json({ error: 'PAYMENT_PROVIDER_NOT_CONFIGURED' }); return; }
    const result = await query<{ id: string; customer_id: string; total_paise: string; phone: string | null; name: string; email: string | null }>(
      'SELECT o.id,o.customer_id,o.total_paise,u.phone,u.name,u.email FROM orders o JOIN users u ON u.id=o.customer_id WHERE o.id=$1 LIMIT 1',[input.orderId]);
    const order = result.rows[0];
    if (!order) { res.status(404).json({ error: 'ORDER_NOT_FOUND' }); return; }
    if (req.authUser!.id !== order.customer_id && !['SUPER_ADMIN','ADMIN','FINANCE_ADMIN'].includes(req.authUser!.role)) { res.status(403).json({ error:'FORBIDDEN' }); return; }
    if (!order.phone) { res.status(400).json({ error:'CUSTOMER_PHONE_REQUIRED' }); return; }
    const cf = await createCashfreeOrder({ orderId: order.id, amountPaise: Number(order.total_paise), customerId: order.customer_id, customerPhone: order.phone, customerName: order.name, customerEmail: order.email ?? undefined, returnUrl: input.returnUrl, notifyUrl: input.notifyUrl });
    const updatedPayment = await query<{id:string}>(`UPDATE payments SET method='ONLINE',status='PENDING',provider='CASHFREE',provider_order_id=$1,amount_paise=$2,currency='INR',raw_response=$3,updated_at=NOW() WHERE order_id=$4 RETURNING id`,
      [cf.orderId,Number(order.total_paise),JSON.stringify(cf.raw),order.id]);
    if (updatedPayment.rows.length===0) {
      await query(`INSERT INTO payments(order_id,method,status,provider,provider_order_id,amount_paise,currency,raw_response,updated_at) VALUES($1,'ONLINE','PENDING','CASHFREE',$2,$3,'INR',$4,NOW())`,
        [order.id,cf.orderId,Number(order.total_paise),JSON.stringify(cf.raw)]);
    }
    res.json({ paymentSessionId: cf.paymentSessionId, providerOrderId: cf.orderId });
  } catch (e) { next(e); }
});

router.get('/payments/:orderId/status', async (req, res, next) => {
  try {
    const orderId = z.string().uuid().parse(req.params.orderId);
    const result = await query<{ customer_id: string }>('SELECT customer_id FROM orders WHERE id=$1 LIMIT 1',[orderId]);
    if (!result.rows[0]) { res.status(404).json({ error:'ORDER_NOT_FOUND' }); return; }
    if (req.authUser!.id !== result.rows[0].customer_id && !['SUPER_ADMIN','ADMIN','FINANCE_ADMIN'].includes(req.authUser!.role)) { res.status(403).json({ error:'FORBIDDEN' }); return; }
    const gatewayOrderId = orderId;
    const raw = await getCashfreePayments(gatewayOrderId);
    res.json({ orderId, payments: raw });
  } catch (e) { next(e); }
});

router.get('/maps/route-estimate', async (req, res, next) => {
  try {
    const input = z.object({
      originLatitude: z.coerce.number().min(-90).max(90),
      originLongitude: z.coerce.number().min(-180).max(180),
      destinationLatitude: z.coerce.number().min(-90).max(90),
      destinationLongitude: z.coerce.number().min(-180).max(180),
      travelMode: z.enum(['TWO_WHEELER','DRIVE','BICYCLE','WALK']).default('TWO_WHEELER'),
    }).parse(req.query);
    const result = await estimateRoute({
      origin: { latitude: input.originLatitude, longitude: input.originLongitude },
      destination: { latitude: input.destinationLatitude, longitude: input.destinationLongitude },
      travelMode: input.travelMode,
    });
    res.json(result);
  } catch (e) { next(e); }
});

// This route is mounted before any additional fulfillment side effects are introduced.
webhookRouter.post('/memberships/webhook', async (req, res, next) => {
  try {
    const signature=req.header('x-webhook-signature'); const timestamp=req.header('x-webhook-timestamp');
    const rawBody=typeof req.rawBody==='string'?req.rawBody:JSON.stringify(req.body??{});
    if(!verifyCashfreeWebhook(rawBody,signature,timestamp)){res.status(401).json({error:'INVALID_WEBHOOK_SIGNATURE'});return;}
    const event=z.record(z.string(),z.unknown()).parse(req.body);
    const providerEventId=String(event.event_id??event.id??req.header('x-webhook-event-id')??'');
    const providerSubscriptionId=String(event.subscription_id ?? ((event.data as Record<string, unknown> | undefined)?.subscription_id ?? ''));
    const rawStatus=String(event.status??event.subscription_status??(event.data as Record<string,unknown>|undefined)?.status??'').toUpperCase();
    const statusMap:Record<string,string>={ACTIVE:'ACTIVE',ACTIVATED:'ACTIVE',PAID:'ACTIVE',PAST_DUE:'PAST_DUE',PAYMENT_FAILED:'PAST_DUE',CANCELLED:'CANCELLED',CANCELED:'CANCELLED',EXPIRED:'EXPIRED'};
    const status=statusMap[rawStatus];
    if(!providerSubscriptionId||!status){res.status(400).json({error:'INVALID_MEMBERSHIP_EVENT'});return;}
    const existing=await query<{id:string;status:string;user_id:string}>(`SELECT id,status,user_id FROM customer_memberships WHERE provider_subscription_id=$1 LIMIT 1`,[providerSubscriptionId]);
    if(!existing.rows[0]){res.status(404).json({error:'MEMBERSHIP_NOT_FOUND'});return;}
    const membership=existing.rows[0];
    const eventInsert=await query<{id:string}>(`INSERT INTO membership_events(membership_id,event_type,provider_event_id,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(provider_event_id) DO NOTHING RETURNING id`,[membership.id,`PROVIDER_${status}`,providerEventId||null,JSON.stringify(event)]);
    if(providerEventId && !eventInsert.rows[0]){res.json({received:true,duplicate:true});return;}
    const active=status==='ACTIVE';
    await query(`UPDATE customer_memberships SET status=$1::varchar,starts_at=CASE WHEN $1='ACTIVE' THEN COALESCE(starts_at,NOW()) ELSE starts_at END,updated_at=NOW() WHERE id=$2`,[status,membership.id]);
    if(active){await query(`UPDATE customer_memberships SET status='EXPIRED',updated_at=NOW() WHERE user_id=$1 AND id<>$2 AND status='ACTIVE'`,[membership.user_id,membership.id]);
      const {publishDomainEvent}=await import('../../services/integrations/event-bus.js'); await publishDomainEvent({type:'MEMBERSHIP_ACTIVATED',aggregateType:'CUSTOMER_MEMBERSHIP',aggregateId:membership.id,payload:{providerSubscriptionId,status}});
    }
    res.json({received:true,membershipId:membership.id,status});
  } catch(e){next(e);}
});

webhookRouter.post('/payments/webhook', async (req, res, next) => {
  try {
    const signature = req.header('x-webhook-signature');
    const timestamp = req.header('x-webhook-timestamp');
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(req.body ?? {});
    if (!verifyCashfreeWebhook(rawBody, signature, timestamp)) { res.status(401).json({ error:'INVALID_WEBHOOK_SIGNATURE' }); return; }
    const event = z.record(z.string(), z.unknown()).parse(req.body);
    const parsed = parseCashfreePaymentEvent(event);
    if (!parsed) { res.status(400).json({ error:'PAYMENT_EVENT_ORDER_ID_MISSING' }); return; }
    const eventKey = req.header('x-webhook-event-id') ?? `${timestamp}:${signature}`;
    const insert = await query<{id:string;processed_at:string|null}>(`INSERT INTO payment_webhook_events(provider,event_key,order_id,event_type,payload,received_at) VALUES('CASHFREE',$1,$2,$3,$4,NOW()) ON CONFLICT(provider,event_key) DO UPDATE SET event_key=EXCLUDED.event_key RETURNING id,processed_at`,[eventKey,parsed.orderId,String(event.type??event.event_type??'UNKNOWN'),JSON.stringify(event)]);
    const webhookId=insert.rows[0]!.id;
    if(insert.rows[0]!.processed_at){res.json({received:true,duplicate:true,processed:true});return;}
    const order=await query<{id:string;total_paise:string;status:string}>('SELECT id,total_paise,status::text FROM orders WHERE id=$1 LIMIT 1',[parsed.orderId]);
    if(!order.rows[0]){await query(`UPDATE payment_webhook_events SET processed_at=NOW(),processing_error='ORDER_NOT_FOUND' WHERE id=$1`,[webhookId]);res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
    if(parsed.amountPaise!=null && parsed.amountPaise!==Number(order.rows[0].total_paise)){await query(`UPDATE payment_webhook_events SET processed_at=NOW(),processing_error='PAYMENT_AMOUNT_MISMATCH' WHERE id=$1`,[webhookId]);res.status(409).json({error:'PAYMENT_AMOUNT_MISMATCH'});return;}
    const paymentStatus=parsed.status==='PAID'?'PAID':parsed.status==='FAILED'?'FAILED':'PENDING';
    await query(`UPDATE payments SET status=$1::payment_status,provider='CASHFREE',provider_payment_id=COALESCE($2,provider_payment_id),raw_response=$3,updated_at=NOW() WHERE order_id=$4`,[paymentStatus,parsed.providerPaymentId??null,JSON.stringify(event),parsed.orderId]);
    if(parsed.status==='PAID'){
      await query(`UPDATE orders SET status='PAID',updated_at=NOW() WHERE id=$1 AND status IN ('PAYMENT_PENDING','PLACED')`,[parsed.orderId]);
      await postPlatformRevenue(parsed.orderId);
      await recordOrderEvent({orderId:parsed.orderId,eventType:'PAID',source:'CASHFREE_WEBHOOK',payload:{providerPaymentId:parsed.providerPaymentId??null}});
    } else if(parsed.status==='FAILED'){
      const client=await pool.connect();
      try {
        await client.query('BEGIN');
        const failedOrder=await client.query<{customer_id:string;wallet_applied_paise:string}>(`SELECT customer_id,wallet_applied_paise FROM orders WHERE id=$1 FOR UPDATE`,[parsed.orderId]);
        if(failedOrder.rows[0]) {
          await releaseInventoryForOrder(client,parsed.orderId);
          const walletAmount=Number(failedOrder.rows[0].wallet_applied_paise||0);
          if(walletAmount>0) await creditWalletForRefund(client,failedOrder.rows[0].customer_id,walletAmount,parsed.orderId);
          await client.query(`UPDATE orders SET status='PAYMENT_FAILED',wallet_refund_paise=$1,updated_at=NOW() WHERE id=$2 AND status='PAYMENT_PENDING'`,[walletAmount,parsed.orderId]);
        }
        await client.query('COMMIT');
      } catch(error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
      await recordOrderEvent({orderId:parsed.orderId,eventType:'PAYMENT_FAILED',source:'CASHFREE_WEBHOOK',payload:{providerPaymentId:parsed.providerPaymentId??null}});
    }
    await query(`UPDATE payment_webhook_events SET processed_at=NOW(),processing_error=NULL WHERE id=$1`,[webhookId]);
    res.json({received:true,processed:true,orderId:parsed.orderId,paymentStatus:parsed.status});
  } catch(e){next(e);}
});

router.get('/notifications', async (req, res, next) => {
  try {
    const r = await query(`SELECT id,channel,title,body,data,status,read_at,created_at,sent_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [req.authUser!.id]);
    res.json({ notifications: r.rows });
  } catch (e) { next(e); }
});

router.patch('/notifications/:id/read', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const r = await query(`UPDATE notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 AND user_id=$2 RETURNING id,read_at`, [id, req.authUser!.id]);
    if (!r.rows[0]) { res.status(404).json({ error:'NOTIFICATION_NOT_FOUND' }); return; }
    res.json({ notification: r.rows[0] });
  } catch (e) { next(e); }
});

router.post('/notifications/dispatch', requirePermission('MANAGE_SYSTEM_CONFIG'), async (_req, res, next) => {
  try { res.json(await dispatchPendingNotifications()); } catch (e) { next(e); }
});

router.post('/notifications/test', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req, res, next) => {
  try {
    const input = z.object({ userId:z.string().uuid(), title:z.string().min(1).max(120), body:z.string().min(1).max(500), channel:z.enum(['PUSH','WHATSAPP','SMS','EMAIL']).default('PUSH') }).parse(req.body);
    const id = await queueNotification({ ...input, data:{type:'SYSTEM_TEST'}, dispatchNow:true });
    res.status(201).json({ notificationId:id });
  } catch (e) { next(e); }
});

router.post('/notifications/device-token', async (req, res, next) => {
  try {
    const input = z.object({ token: z.string().min(10).max(4096), platform: z.enum(['android','ios','web']) }).parse(req.body);
    await query(`INSERT INTO device_tokens(user_id,platform,token,is_active,updated_at) VALUES($1,$2,$3,TRUE,NOW()) ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,is_active=TRUE,updated_at=NOW()`, [req.authUser!.id,input.platform,input.token]);
    res.json({ registered: true });
  } catch (e) { next(e); }
});

router.get('/admin/outbox', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req,res,next)=>{try{const limit=Math.min(200,Math.max(1,Number(req.query.limit??100)));const r=await query(`SELECT id,event_type,aggregate_type,aggregate_id,status,attempts,available_at,processed_at,last_error,created_at FROM integration_outbox ORDER BY created_at DESC LIMIT $1`,[limit]);res.json({events:r.rows,mode:'database'});}catch(e){next(e);}});
router.post('/admin/outbox/dispatch', requirePermission('MANAGE_SYSTEM_CONFIG'), async (_req,res,next)=>{try{const {dispatchIntegrationOutbox}=await import('../../services/integrations/event-bus.js');res.json(await dispatchIntegrationOutbox());}catch(e){next(e);}});

export { webhookRouter };
export default router;
