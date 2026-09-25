import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { query, pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { recordOrderEvent } from '../services/orders/events.js';
import { queueNotification } from '../services/notifications/service.js';
import { releaseInventoryForOrder, commitInventoryForOrder } from '../services/commerce/inventory.js';

const router = Router();
router.use(requireAuth, requirePermission('VIEW_DASHBOARD'));

router.get('/summary', async (_req,res,next)=>{try{
  const [v,c,d,o,t,rev,fees,gst,active,available]=await Promise.all([
    query<{count:string}>('SELECT COUNT(*)::text count FROM vendors WHERE status=\'ACTIVE\''),
    query<{count:string}>(`SELECT COUNT(*)::text count FROM users WHERE role='CUSTOMER' AND is_active=true`),
    query<{count:string}>(`SELECT COUNT(*)::text count FROM users WHERE role='DELIVERY_PARTNER' AND is_active=true`),
    query<{count:string}>('SELECT COUNT(*)::text count FROM orders'),
    query<{count:string}>(`SELECT COUNT(*)::text count FROM support_tickets WHERE status NOT IN ('RESOLVED','CLOSED')`),
    query<{sum:string}>(`SELECT COALESCE(SUM(total_paise),0)::text sum FROM orders WHERE status NOT IN ('CANCELLED','REFUNDED')`),
    query<{sum:string}>(`SELECT COALESCE(SUM(amount_paise),0)::text sum FROM ledger_entries WHERE entry_type='PLATFORM_FEE' AND direction='CREDIT'`),
    query<{sum:string}>(`SELECT COALESCE(SUM(amount_paise),0)::text sum FROM ledger_entries WHERE entry_type='PLATFORM_GST' AND direction='CREDIT'`),
    query<{count:string}>(`SELECT COUNT(*)::text count FROM orders WHERE status NOT IN ('DELIVERED','CANCELLED','REFUNDED')`),
    query<{count:string}>(`SELECT COUNT(*)::text count FROM delivery_partners WHERE status='AVAILABLE'`),
  ]);
  res.json({vendors:Number(v.rows[0]?.count??0),customers:Number(c.rows[0]?.count??0),deliveryPartners:Number(d.rows[0]?.count??0),orders:Number(o.rows[0]?.count??0),openTickets:Number(t.rows[0]?.count??0),revenuePaise:Number(rev.rows[0]?.sum??0),platformFeesPaise:Number(fees.rows[0]?.sum??0),gstPaise:Number(gst.rows[0]?.sum??0),activeOrders:Number(active.rows[0]?.count??0),availableDeliveryPartners:Number(available.rows[0]?.count??0),mode:'database'});
}catch(e){next(e)}});

router.get('/orders', async (req,res,next)=>{try{
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : null;
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim() : null;
  const r=await query(`SELECT o.id,o.status,o.subtotal_paise,o.delivery_fee_paise,o.platform_fee_paise,o.platform_gst_paise,o.total_paise,o.created_at,o.updated_at,
    v.id vendor_id,v.name vendor_name,u.id customer_id,u.name customer_name,cp.customer_code,
    p.method payment_method,p.status payment_status,
    da.status delivery_status,du.name delivery_partner_name
    FROM orders o JOIN vendors v ON v.id=o.vendor_id JOIN users u ON u.id=o.customer_id JOIN customer_profiles cp ON cp.user_id=u.id
    LEFT JOIN LATERAL (SELECT method,status FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON TRUE
    LEFT JOIN delivery_assignments da ON da.order_id=o.id
    LEFT JOIN delivery_partners dp ON dp.id=da.delivery_partner_id
    LEFT JOIN users du ON du.id=dp.user_id
    WHERE ($1::text IS NULL OR o.status::text=$1)
      AND ($2::text IS NULL OR o.id::text ILIKE '%'||$2||'%' OR cp.customer_code ILIKE '%'||$2||'%' OR u.name ILIKE '%'||$2||'%' OR v.name ILIKE '%'||$2||'%')
    ORDER BY o.created_at DESC LIMIT 200`,[status,q]);
  res.json({orders:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/orders/:id', async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id);
  const order=await query(`SELECT o.*,v.name vendor_name,u.name customer_name,u.phone customer_phone,cp.customer_code FROM orders o JOIN vendors v ON v.id=o.vendor_id JOIN users u ON u.id=o.customer_id JOIN customer_profiles cp ON cp.user_id=u.id WHERE o.id=$1 LIMIT 1`,[id]);
  if(!order.rows[0]){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const [items,payment,delivery,events]=await Promise.all([
    query(`SELECT oi.*,p.name FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1`,[id]),
    query(`SELECT * FROM payments WHERE order_id=$1 ORDER BY created_at DESC`,[id]),
    query(`SELECT da.*,u.name delivery_partner_name,u.phone delivery_partner_phone FROM delivery_assignments da LEFT JOIN delivery_partners dp ON dp.id=da.delivery_partner_id LEFT JOIN users u ON u.id=dp.user_id WHERE da.order_id=$1 LIMIT 1`,[id]),
    query(`SELECT id,event_type,source,actor_user_id,payload,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at ASC`,[id]),
  ]);
  res.json({order:order.rows[0],items:items.rows,payments:payment.rows,delivery:delivery.rows[0]??null,events:events.rows,mode:'database'});
}catch(e){next(e)}});

router.patch('/orders/:id/status', requirePermission('MANAGE_ORDERS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id);
  const input=z.object({status:z.enum(['PLACED','PAYMENT_PENDING','PAYMENT_FAILED','PAID','COD_CONFIRMED','VENDOR_ACCEPTED','PREPARING','READY_FOR_PICKUP','DELIVERY_ASSIGNED','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','CANCELLED','REFUND_PENDING','REFUNDED']),reason:z.string().trim().max(500).optional()}).parse(req.body);
  const current=await query<{status:string}>('SELECT status::text FROM orders WHERE id=$1 FOR UPDATE',[id]);
  if(!current.rows[0]){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE orders SET status=$1::order_status,updated_at=NOW() WHERE id=$2`,[input.status,id]);
    if(input.status==='CANCELLED') await releaseInventoryForOrder(client,id);
    if(input.status==='DELIVERED') await commitInventoryForOrder(client,id);
    await client.query('COMMIT');
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; } finally { client.release(); }
  await audit('ADMIN_ORDER_STATUS_UPDATED','orders',id,req.authUser!.id,{from:current.rows[0].status,to:input.status,reason:input.reason??null});
  await recordOrderEvent({orderId:id,eventType:input.status,source:'ADMIN',actorUserId:req.authUser!.id,payload:{reason:input.reason??null}});
  res.json({ok:true,status:input.status});
}catch(e){next(e)}});

router.get('/vendors', async (req,res,next)=>{try{
  const q=typeof req.query.q==='string'&&req.query.q.trim()?req.query.q.trim():null;
  const r=await query(`SELECT v.id,v.name,v.status,v.rating,v.review_count,v.is_open,v.city,v.locality,v.phone,v.created_at,v.updated_at,v.latitude,v.longitude,
    vp.name plan_name,COALESCE(today.order_count,0)::int order_count_today,
    COALESCE(prod.product_count,0)::int product_count,COALESCE(prod.active_product_count,0)::int active_product_count,
    COALESCE(k.status,'PENDING') kyc_status,COALESCE(s.status,'INACTIVE') subscription_status
    FROM vendors v LEFT JOIN vendor_plans vp ON vp.id=v.plan_id
    LEFT JOIN vendor_kyc k ON k.vendor_id=v.id
    LEFT JOIN vendor_subscriptions s ON s.vendor_id=v.id AND s.status='ACTIVE'
    LEFT JOIN LATERAL (SELECT COUNT(*)::int product_count,COUNT(*) FILTER(WHERE is_active=true)::int active_product_count FROM products WHERE vendor_id=v.id) prod ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*)::int order_count FROM orders WHERE vendor_id=v.id AND created_at>=CURRENT_DATE) today ON TRUE
    WHERE ($1::text IS NULL OR v.name ILIKE '%'||$1||'%' OR v.city ILIKE '%'||$1||'%' OR v.locality ILIKE '%'||$1||'%')
    ORDER BY v.created_at DESC LIMIT 200`,[q]);
  res.json({vendors:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/customers', async (req,res,next)=>{try{
  const q=typeof req.query.q==='string'&&req.query.q.trim()?req.query.q.trim():null;
  const r=await query(`SELECT u.id,cp.customer_code,u.name,u.phone,u.email,u.is_active,u.created_at,cp.last_active_at,
    COALESCE(stats.order_count,0)::int order_count,COALESCE(stats.active_order_count,0)::int active_order_count,
    COALESCE(stats.total_spend_paise,0)::bigint total_spend_paise,stats.last_order_at,
    COALESCE(tix.ticket_count,0)::int ticket_count
    FROM users u JOIN customer_profiles cp ON cp.user_id=u.id
    LEFT JOIN LATERAL (SELECT COUNT(*)::int order_count,COUNT(*) FILTER(WHERE status NOT IN ('DELIVERED','CANCELLED','REFUNDED'))::int active_order_count,COALESCE(SUM(total_paise) FILTER(WHERE status NOT IN ('CANCELLED','REFUNDED')),0)::bigint total_spend_paise,MAX(created_at) last_order_at FROM orders WHERE customer_id=u.id) stats ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*)::int ticket_count FROM support_tickets WHERE requester_user_id=u.id) tix ON TRUE
    WHERE u.role='CUSTOMER' AND ($1::text IS NULL OR cp.customer_code ILIKE '%'||$1||'%' OR u.phone ILIKE '%'||$1||'%' OR u.name ILIKE '%'||$1||'%')
    ORDER BY u.created_at DESC LIMIT 200`,[q]);
  res.json({customers:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/customers/:customerId', requirePermission('VIEW_CUSTOMER_PROFILE'), async (req,res,next)=>{try{
  const customerId=z.string().min(5).max(64).parse(req.params.customerId);
  const r=await query<{user_id:string}>(`SELECT user_id FROM customer_profiles WHERE customer_code=$1 LIMIT 1`,[customerId]);
  if(!r.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  const userId=r.rows[0].user_id;
  const [profile,addresses,orders,tickets,notifications]=await Promise.all([
    query(`SELECT u.id AS user_id,cp.customer_code,u.name,u.phone,u.email,u.is_active,u.created_at,cp.preferred_language,cp.marketing_opt_in,cp.last_active_at FROM users u JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.id=$1`,[userId]),
    query(`SELECT id,label,line1,line2,locality,city,state,postal_code,is_default,latitude,longitude FROM addresses WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC`,[userId]),
    query(`SELECT o.id,o.status,o.total_paise,o.created_at,v.name vendor_name FROM orders o JOIN vendors v ON v.id=o.vendor_id WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 100`,[userId]),
    query(`SELECT id,subject,status,priority,order_id,assigned_to,created_at,updated_at FROM support_tickets WHERE requester_user_id=$1 ORDER BY updated_at DESC LIMIT 100`,[userId]),
    query(`SELECT id,channel,title,body,status,created_at,sent_at FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`,[userId]),
  ]);
  if(!profile.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  await audit('ADMIN_CUSTOMER_360_VIEWED','users',userId,req.authUser!.id,{customerCode:customerId});
  res.json({profile:profile.rows[0],addresses:addresses.rows,orders:orders.rows,tickets:tickets.rows,notifications:notifications.rows,mode:'database'});
}catch(e){next(e)}});


router.patch('/vendors/:id/status', requirePermission('MANAGE_VENDORS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=z.object({status:z.enum(['PENDING','ACTIVE','SUSPENDED','REJECTED']),reason:z.string().trim().max(500).optional()}).parse(req.body);
  const r=await query<{owner_user_id:string|null;status:string}>(`UPDATE vendors SET status=$1::vendor_status,updated_at=NOW() WHERE id=$2 RETURNING owner_user_id,status::text`,[input.status,id]);
  if(!r.rows[0]){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  await audit('ADMIN_VENDOR_STATUS_UPDATED','vendors',id,req.authUser!.id,{status:input.status,reason:input.reason??null});
  if(r.rows[0].owner_user_id) await queueNotification({userId:r.rows[0].owner_user_id,channel:'PUSH',title:'AasPass vendor status updated',body:`Your store is now ${input.status}.`,data:{type:'VENDOR_STATUS',vendorId:id,status:input.status}});
  res.json({ok:true,status:r.rows[0].status});
}catch(e){next(e)}});

router.patch('/vendors/:id/kyc', requirePermission('MANAGE_VENDORS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=z.object({status:z.enum(['PENDING','VERIFIED','REJECTED']),notes:z.string().max(2000).optional()}).parse(req.body);
  const r=await query(`INSERT INTO vendor_kyc(vendor_id,status,reviewed_by,reviewed_at,notes) VALUES($1,$2,$3,NOW(),$4) ON CONFLICT(vendor_id) DO UPDATE SET status=EXCLUDED.status,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=NOW(),notes=EXCLUDED.notes,updated_at=NOW() RETURNING *`,[id,input.status,req.authUser!.id,input.notes??null]);
  await audit('ADMIN_VENDOR_KYC_UPDATED','vendor_kyc',r.rows[0]?.id??null,req.authUser!.id,{vendorId:id,status:input.status});
  res.json({kyc:r.rows[0]});
}catch(e){next(e)}});

router.patch('/customers/:customerId/status', requirePermission('MANAGE_USERS'), async (req,res,next)=>{try{
  const customerId=z.string().min(5).max(64).parse(req.params.customerId); const input=z.object({isActive:z.boolean(),reason:z.string().trim().max(500).optional()}).parse(req.body);
  const r=await query<{user_id:string}>(`UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=(SELECT user_id FROM customer_profiles WHERE customer_code=$2 LIMIT 1) AND role='CUSTOMER' RETURNING id AS user_id`,[input.isActive,customerId]);
  if(!r.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  await audit('ADMIN_CUSTOMER_STATUS_UPDATED','users',r.rows[0].user_id,req.authUser!.id,{customerCode:customerId,isActive:input.isActive,reason:input.reason??null});
  await queueNotification({userId:r.rows[0].user_id,channel:'PUSH',title:'AasPass account status changed',body:`Your AasPass account is now ${input.isActive?'active':'inactive'}.`,data:{type:'ACCOUNT_STATUS',customerCode:customerId,isActive:String(input.isActive)}});
  res.json({ok:true,isActive:input.isActive});
}catch(e){next(e)}});

router.patch('/delivery/:id/status', requirePermission('MANAGE_DELIVERY'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=z.object({status:z.enum(['OFFLINE','AVAILABLE','BUSY']),reason:z.string().trim().max(500).optional()}).parse(req.body);
  const r=await query<{user_id:string;status:string}>(`UPDATE delivery_partners SET status=$1,last_seen_at=NOW(),updated_at=NOW() WHERE id=$2 RETURNING user_id,status`,[input.status,id]);
  if(!r.rows[0]){res.status(404).json({error:'DELIVERY_PARTNER_NOT_FOUND'});return;}
  await audit('ADMIN_DELIVERY_STATUS_UPDATED','delivery_partners',id,req.authUser!.id,{status:input.status,reason:input.reason??null});
  await queueNotification({userId:r.rows[0].user_id,channel:'PUSH',title:'AasPass delivery status updated',body:`Your delivery status is now ${input.status}.`,data:{type:'DELIVERY_STATUS',deliveryPartnerId:id,status:input.status}});
  res.json({ok:true,status:r.rows[0].status});
}catch(e){next(e)}});

router.get('/delivery', async (_req,res,next)=>{try{
  const r=await query(`SELECT dp.id,dp.user_id,dp.mode,dp.status,dp.kyc_status,dp.latitude,dp.longitude,dp.last_seen_at,u.name,u.phone,
    COALESCE(active.active_count,0)::int active_assignments,COALESCE(today.deliveries,0)::int deliveries_today,COALESCE(today.earnings_paise,0)::bigint earnings_today
    FROM delivery_partners dp JOIN users u ON u.id=dp.user_id
    LEFT JOIN LATERAL (SELECT COUNT(*)::int active_count FROM delivery_assignments WHERE delivery_partner_id=dp.id AND status NOT IN ('DELIVERED','CANCELLED')) active ON TRUE
    LEFT JOIN LATERAL (SELECT COUNT(*) FILTER(WHERE status='DELIVERED')::int deliveries,COALESCE(SUM(earning_paise+bonus_paise) FILTER(WHERE status='DELIVERED'),0)::bigint earnings_paise FROM delivery_assignments WHERE delivery_partner_id=dp.id AND created_at>=CURRENT_DATE) today ON TRUE
    ORDER BY dp.updated_at DESC LIMIT 200`);
  res.json({partners:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/support', async (_req,res,next)=>{try{
  const r=await query(`SELECT t.id,t.subject,t.description,t.status,t.priority,t.order_id,t.assigned_to,t.created_at,t.updated_at,
    requester.name requester_name,requester.phone requester_phone,cp.customer_code,assignee.name assignee_name
    FROM support_tickets t JOIN users requester ON requester.id=t.requester_user_id JOIN customer_profiles cp ON cp.user_id=requester.id
    LEFT JOIN users assignee ON assignee.id=t.assigned_to ORDER BY CASE t.priority WHEN 'URGENT' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END,t.updated_at DESC LIMIT 200`);
  res.json({tickets:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/finance', requirePermission('VIEW_SETTLEMENTS'), async (_req,res,next)=>{try{
  const [summary,mismatches,refunds,ledger]=await Promise.all([
    query(`SELECT COUNT(*)::int payment_count,COUNT(*) FILTER(WHERE p.status='PAID')::int paid_count,COALESCE(SUM(CASE WHEN p.status='PAID' THEN p.amount_paise ELSE 0 END),0)::bigint paid_amount_paise,COALESCE(SUM(CASE WHEN p.status='PAID' THEN o.platform_fee_paise ELSE 0 END),0)::bigint platform_fee_paise,COALESCE(SUM(CASE WHEN p.status='PAID' THEN o.platform_gst_paise ELSE 0 END),0)::bigint platform_gst_paise FROM payments p JOIN orders o ON o.id=p.order_id`),
    query(`SELECT p.order_id,p.amount_paise,o.total_paise,p.status FROM payments p JOIN orders o ON o.id=p.order_id WHERE p.amount_paise<>o.total_paise ORDER BY p.created_at DESC LIMIT 100`),
    query(`SELECT r.id,r.order_id,r.amount_paise,r.status,r.reason,r.created_at FROM refunds r WHERE r.status IN ('PENDING','PROCESSING') ORDER BY r.created_at ASC LIMIT 100`),
    query(`SELECT entry_type,direction,COALESCE(SUM(amount_paise),0)::bigint amount_paise,COUNT(*)::int entries FROM ledger_entries GROUP BY entry_type,direction ORDER BY entry_type,direction`),
  ]);
  res.json({summary:summary.rows[0],mismatches:mismatches.rows,pendingRefunds:refunds.rows,ledger:ledger.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/people', requirePermission('MANAGE_USERS'), async (_req,res,next)=>{try{
  const r=await query(`SELECT id,name,phone,email,role,is_active,created_at,updated_at FROM users WHERE role<>'CUSTOMER' ORDER BY created_at DESC LIMIT 500`);
  res.json({people:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/settings', async (_req,res,next)=>{try{
  const [settings,launches]=await Promise.all([
    query(`SELECT key,value,updated_at FROM platform_settings ORDER BY key`),
    query(`SELECT id,city,state,country,stage,status,target_vendors,target_orders_per_vendor_day,notes,created_at,updated_at FROM market_launches ORDER BY updated_at DESC`),
  ]);
  res.json({settings:settings.rows,launches:launches.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/audit', requirePermission('VIEW_DASHBOARD'), async (req,res,next)=>{try{
  const entityType=typeof req.query.entityType==='string'&&req.query.entityType.trim()?req.query.entityType.trim():null;
  const entityId=typeof req.query.entityId==='string'&&req.query.entityId.trim()?req.query.entityId.trim():null;
  const limit=Math.min(Math.max(Number(req.query.limit??100)||100,1),200);
  const r=await query(`SELECT a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,u.name actor_name,u.role actor_role
    FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id
    WHERE ($1::text IS NULL OR a.entity_type=$1) AND ($2::uuid IS NULL OR a.entity_id=$2::uuid)
    ORDER BY a.created_at DESC LIMIT $3`,[entityType,entityId,limit]);
  res.json({audit:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/customers/:customerId/notify', requirePermission('MANAGE_USERS'), async (req,res,next)=>{try{
  const customerId=z.string().min(5).max(64).parse(req.params.customerId);
  const input=z.object({title:z.string().trim().min(3).max(255),body:z.string().trim().min(1).max(2000),channel:z.enum(['PUSH','SMS','EMAIL']).default('PUSH')}).parse(req.body);
  const match=await query<{user_id:string}>(`SELECT user_id FROM customer_profiles WHERE customer_code=$1 LIMIT 1`,[customerId]);
  if(!match.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
  const id=await queueNotification({userId:match.rows[0].user_id,channel:input.channel,title:input.title,body:input.body,data:{type:'ADMIN_MESSAGE',customerCode:customerId,actorUserId:req.authUser!.id}});
  if(!id){res.status(409).json({error:'NOTIFICATION_BLOCKED',message:'Customer notification preferences do not allow this channel'});return;}
  await audit('ADMIN_CUSTOMER_NOTIFICATION_CREATED','notifications',id,req.authUser!.id,{customerCode:customerId,channel:input.channel});
  res.status(201).json({ok:true,id});
}catch(e){next(e)}});



router.get('/gift-cards', requirePermission('MANAGE_GIFT_CARDS'), async (_req,res,next)=>{try{
  const r=await query(`SELECT g.id,g.code_last4,g.initial_balance_paise,g.balance_paise,g.currency,g.status,g.issued_to_user_id,g.expires_at,g.created_at,
    u.name issued_to_name,u.phone issued_to_phone
    FROM gift_cards g LEFT JOIN users u ON u.id=g.issued_to_user_id ORDER BY g.created_at DESC LIMIT 500`);
  res.json({cards:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/gift-cards', requirePermission('MANAGE_GIFT_CARDS'), async (req,res,next)=>{try{
  const input=z.object({amountPaise:z.coerce.number().int().min(100).max(5000000),customerCode:z.string().trim().min(5).max(64).optional(),expiresAt:z.string().datetime().optional()}).parse(req.body);
  let issuedToUserId:string|null=null;
  if(input.customerCode){
    const c=await query<{user_id:string}>(`SELECT user_id FROM customer_profiles WHERE customer_code=$1 LIMIT 1`,[input.customerCode]);
    if(!c.rows[0]){res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}
    issuedToUserId=c.rows[0].user_id;
  }
  const raw=`AASP-${crypto.randomBytes(10).toString('hex').toUpperCase().match(/.{1,4}/g)!.join('-')}`;
  const hash=crypto.createHash('sha256').update(raw).digest('hex');
  const r=await query(`INSERT INTO gift_cards(code_hash,code_last4,initial_balance_paise,balance_paise,issued_to_user_id,expires_at,created_by)
    VALUES($1,$2,$3,$3,$4,$5,$6) RETURNING id,code_last4,initial_balance_paise,balance_paise,currency,status,issued_to_user_id,expires_at,created_at`,
    [hash,raw.slice(-4),input.amountPaise,issuedToUserId,input.expiresAt??null,req.authUser!.id]);
  const card=r.rows[0];
  await audit('ADMIN_GIFT_CARD_ISSUED','gift_cards',card.id,req.authUser!.id,{amountPaise:input.amountPaise,customerCode:input.customerCode??null});
  if(issuedToUserId) await queueNotification({userId:issuedToUserId,channel:'PUSH',title:'AasPass Gift Card received',body:`A gift card worth ₹${(input.amountPaise/100).toFixed(2)} has been added to your account.`,data:{type:'GIFT_CARD_ISSUED',giftCardId:card.id}});
  res.status(201).json({card,code:raw,showCodeOnce:true});
}catch(e){next(e)}});

router.patch('/people/:id/role', requirePermission('MANAGE_USERS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id);
  const input=z.object({role:z.enum(['SUPER_ADMIN','ADMIN','OPERATIONS_ADMIN','FINANCE_ADMIN','VENDOR_MANAGER','DELIVERY_MANAGER','SUPPORT_LEAD','SUPPORT_AGENT','VENDOR_OWNER','VENDOR_STAFF','DELIVERY_PARTNER','CUSTOMER']),reason:z.string().trim().max(500).optional()}).parse(req.body);
  if(id===req.authUser!.id && input.role!=='SUPER_ADMIN'){res.status(400).json({error:'CANNOT_DOWNGRADE_SELF'});return;}
  const current=await query<{role:string}>(`SELECT role::text FROM users WHERE id=$1 LIMIT 1`,[id]);
  if(!current.rows[0]){res.status(404).json({error:'USER_NOT_FOUND'});return;}
  if(current.rows[0].role===input.role){res.json({ok:true,role:input.role});return;}
  const r=await query<{id:string;role:string;is_active:boolean}>(`UPDATE users SET role=$1::user_role,updated_at=NOW() WHERE id=$2 RETURNING id,role::text,is_active`,[input.role,id]);
  await query(`INSERT INTO user_role_history(user_id,old_role,new_role,changed_by,reason) VALUES($1,$2::user_role,$3::user_role,$4,$5)`,[id,current.rows[0].role,input.role,req.authUser!.id,input.reason??null]);
  await audit('ADMIN_USER_ROLE_CHANGED','users',id,req.authUser!.id,{oldRole:current.rows[0].role,newRole:input.role,reason:input.reason??null});
  await queueNotification({userId:id,channel:'PUSH',title:'AasPass role updated',body:`Your AasPass access role is now ${input.role.replaceAll('_',' ')}.`,data:{type:'ROLE_UPDATED',role:input.role}});
  res.json({ok:true,user:r.rows[0]});
}catch(e){next(e)}});

router.patch('/people/:id/status', requirePermission('MANAGE_USERS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id);
  const input=z.object({isActive:z.boolean(),reason:z.string().trim().max(500).optional()}).parse(req.body);
  if(id===req.authUser!.id && !input.isActive){res.status(400).json({error:'CANNOT_DISABLE_SELF'});return;}
  const r=await query<{id:string;is_active:boolean;role:string}>(`UPDATE users SET is_active=$1,updated_at=NOW() WHERE id=$2 RETURNING id,is_active,role::text`,[input.isActive,id]);
  if(!r.rows[0]){res.status(404).json({error:'USER_NOT_FOUND'});return;}
  await audit('ADMIN_USER_STATUS_UPDATED','users',id,req.authUser!.id,{isActive:input.isActive,reason:input.reason??null});
  res.json({ok:true,user:r.rows[0]});
}catch(e){next(e)}});


export default router;
