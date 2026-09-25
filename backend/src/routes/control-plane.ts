import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.js';
import { query, pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { queueNotification } from '../services/notifications/service.js';

const router = Router();
router.use(requireAuth, requirePermission('VIEW_DASHBOARD'));

router.get('/overview', async (_req,res,next)=>{try{
  const [wallets,promos,vsett,dsett,risk,zones]=await Promise.all([
    query(`SELECT COUNT(*)::int accounts,COALESCE(SUM(balance_paise),0)::bigint balance_paise FROM wallet_accounts WHERE is_active=true`),
    query(`SELECT COUNT(*)::int active FROM promotions WHERE is_active=true AND starts_at<=NOW() AND (ends_at IS NULL OR ends_at>NOW())`),
    query(`SELECT COUNT(*)::int pending,COALESCE(SUM(net_payout_paise),0)::bigint pending_paise FROM vendor_settlements WHERE status='PENDING'`),
    query(`SELECT COUNT(*)::int pending,COALESCE(SUM(net_payout_paise),0)::bigint pending_paise FROM delivery_settlements WHERE status='PENDING'`),
    query(`SELECT COUNT(*)::int open,COALESCE(SUM(CASE WHEN severity IN ('HIGH','CRITICAL') THEN 1 ELSE 0 END),0)::int high_risk FROM risk_flags WHERE status='OPEN'`),
    query(`SELECT COUNT(*)::int active FROM service_zones WHERE is_active=true`)
  ]);
  res.json({wallets:wallets.rows[0],promotions:promos.rows[0],vendorSettlements:vsett.rows[0],deliverySettlements:dsett.rows[0],risk:risk.rows[0],serviceZones:zones.rows[0],mode:'database'});
}catch(e){next(e)}});

router.get('/vendor-onboarding', requirePermission('VIEW_VENDORS'), async (_req,res,next)=>{try{
  const r=await query(`SELECT v.id,v.name,v.status,v.city,v.created_at,COALESCE(k.status,'PENDING') kyc_status,
    COALESCE(ac.kyc_complete,false) kyc_complete,COALESCE(ac.subscription_active,false) subscription_active,
    COALESCE(ac.catalog_ready,false) catalog_ready,COALESCE(ac.service_zone_ready,false) service_zone_ready,
    COALESCE(ac.payment_ready,false) payment_ready,COALESCE(ac.verified,false) verified
    FROM vendors v LEFT JOIN vendor_kyc k ON k.vendor_id=v.id LEFT JOIN vendor_activation_checks ac ON ac.vendor_id=v.id ORDER BY v.updated_at DESC LIMIT 500`);
  res.json({vendors:r.rows,mode:'database'});
}catch(e){next(e)}});

router.patch('/vendors/:id/activation', requirePermission('MANAGE_VENDORS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id);
  const input=z.object({kycComplete:z.boolean().optional(),subscriptionActive:z.boolean().optional(),catalogReady:z.boolean().optional(),serviceZoneReady:z.boolean().optional(),paymentReady:z.boolean().optional(),verified:z.boolean().optional(),notes:z.string().trim().max(1000).optional()}).parse(req.body);
  const current=await query<any>(`SELECT * FROM vendor_activation_checks WHERE vendor_id=$1`,[id]);
  const c=current.rows[0]??{};
  const merged={kycComplete:input.kycComplete??Boolean(c.kyc_complete),subscriptionActive:input.subscriptionActive??Boolean(c.subscription_active),catalogReady:input.catalogReady??Boolean(c.catalog_ready),serviceZoneReady:input.serviceZoneReady??Boolean(c.service_zone_ready),paymentReady:input.paymentReady??Boolean(c.payment_ready),verified:input.verified??Boolean(c.verified)};
  const verified=merged.verified && Object.values(merged).slice(0,5).every(Boolean);
  const r=await query(`INSERT INTO vendor_activation_checks(vendor_id,kyc_complete,subscription_active,catalog_ready,service_zone_ready,payment_ready,verified,notes,updated_by,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) ON CONFLICT(vendor_id) DO UPDATE SET kyc_complete=$2,subscription_active=$3,catalog_ready=$4,service_zone_ready=$5,payment_ready=$6,verified=$7,notes=$8,updated_by=$9,updated_at=NOW() RETURNING *`,[id,merged.kycComplete,merged.subscriptionActive,merged.catalogReady,merged.serviceZoneReady,merged.paymentReady,verified,input.notes??null,req.authUser!.id]);
  await query(`INSERT INTO vendor_onboarding_events(vendor_id,step,status,notes,actor_user_id) VALUES($1,'ACTIVATION_CHECK',$2,$3,$4)`,[id,verified?'VERIFIED':'IN_PROGRESS',input.notes??null,req.authUser!.id]);
  await audit('VENDOR_ACTIVATION_CHECK_UPDATED','vendors',id,req.authUser!.id,{...merged,verified});
  res.json({activation:r.rows[0]});
}catch(e){next(e)}});

router.post('/vendors/:id/service-zones', requirePermission('MANAGE_VENDORS'), async (req,res,next)=>{try{
  const vendorId=z.string().uuid().parse(req.params.id); const input=z.object({serviceZoneId:z.string().uuid(),isActive:z.boolean().default(true)}).parse(req.body);
  const r=await query(`INSERT INTO vendor_service_zones(vendor_id,service_zone_id,is_active) VALUES($1,$2,$3) ON CONFLICT(vendor_id,service_zone_id) DO UPDATE SET is_active=EXCLUDED.is_active RETURNING *`,[vendorId,input.serviceZoneId,input.isActive]);
  await query(`UPDATE vendor_activation_checks SET service_zone_ready=EXISTS(SELECT 1 FROM vendor_service_zones WHERE vendor_id=$1 AND is_active=true),updated_by=$2,updated_at=NOW() WHERE vendor_id=$1`,[vendorId,req.authUser!.id]);
  await audit('VENDOR_SERVICE_ZONE_UPDATED','vendors',vendorId,req.authUser!.id,input);
  res.status(201).json({assignment:r.rows[0]});
}catch(e){next(e)}});

router.get('/delivery-onboarding', requirePermission('MANAGE_DELIVERY'), async (_req,res,next)=>{try{
  const r=await query(`SELECT dp.id,dp.user_id,u.name,u.phone,dp.status,dp.kyc_status,dp.mode,dp.latitude,dp.longitude,dp.last_seen_at FROM delivery_partners dp JOIN users u ON u.id=dp.user_id ORDER BY dp.updated_at DESC LIMIT 500`);
  res.json({partners:r.rows,mode:'database'});
}catch(e){next(e)}});

router.patch('/delivery/:id/kyc', requirePermission('MANAGE_DELIVERY'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=z.object({status:z.enum(['PENDING','SUBMITTED','VERIFIED','REJECTED']),notes:z.string().trim().max(1000).optional()}).parse(req.body);
  const r=await query(`UPDATE delivery_partners SET kyc_status=$1,updated_at=NOW() WHERE id=$2 RETURNING id,user_id,kyc_status`,[input.status,id]);
  if(!r.rows[0]){res.status(404).json({error:'DELIVERY_PARTNER_NOT_FOUND'});return;}
  await query(`INSERT INTO delivery_onboarding_events(delivery_partner_id,step,status,notes,actor_user_id) VALUES($1,'KYC',$2,$3,$4)`,[id,input.status,input.notes??null,req.authUser!.id]);
  await audit('DELIVERY_KYC_UPDATED','delivery_partners',id,req.authUser!.id,{status:input.status});
  await queueNotification({userId:r.rows[0].user_id,channel:'PUSH',title:'AasPass delivery KYC updated',body:`Your KYC status is now ${input.status}.`,data:{type:'KYC_STATUS',status:input.status}});
  res.json({partner:r.rows[0]});
}catch(e){next(e)}});

router.get('/service-zones', async (_req,res,next)=>{try{
  const r=await query(`SELECT sz.*,COUNT(vsz.vendor_id)::int vendor_count FROM service_zones sz LEFT JOIN vendor_service_zones vsz ON vsz.service_zone_id=sz.id AND vsz.is_active=true GROUP BY sz.id ORDER BY sz.city,sz.name`);
  res.json({zones:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/service-zones', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req,res,next)=>{try{
  const input=z.object({city:z.string().trim().min(2).max(120),name:z.string().trim().min(2).max(120),radiusM:z.number().int().positive().max(100000),centerLatitude:z.number().min(-90).max(90),centerLongitude:z.number().min(-180).max(180),isActive:z.boolean().default(true)}).parse(req.body);
  const r=await query(`INSERT INTO service_zones(city,name,radius_m,center_latitude,center_longitude,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[input.city,input.name,input.radiusM,input.centerLatitude,input.centerLongitude,input.isActive]);
  await audit('SERVICE_ZONE_CREATED','service_zones',r.rows[0].id,req.authUser!.id,input); res.status(201).json({zone:r.rows[0]});
}catch(e){next(e)}});

router.get('/inventory', requirePermission('VIEW_VENDORS'), async (req,res,next)=>{try{
  const q=typeof req.query.q==='string'&&req.query.q.trim()?req.query.q.trim():null;
  const r=await query(`SELECT p.id,p.name,p.vendor_id,v.name vendor_name,p.stock_qty,p.reserved_qty,(p.stock_qty+p.reserved_qty)::int total_units,p.is_active,p.updated_at,
    COUNT(ir.id) FILTER(WHERE ir.status='HELD')::int active_reservations
    FROM products p JOIN vendors v ON v.id=p.vendor_id LEFT JOIN inventory_reservations ir ON ir.product_id=p.id
    WHERE ($1::text IS NULL OR p.name ILIKE '%'||$1||'%' OR v.name ILIKE '%'||$1||'%')
    GROUP BY p.id,v.id ORDER BY p.stock_qty ASC,p.updated_at DESC LIMIT 500`,[q]);
  res.json({products:r.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/promotions', async (_req,res,next)=>{try{
  const r=await query(`SELECT p.*,COUNT(pr.id)::int redemptions FROM promotions p LEFT JOIN promotion_redemptions pr ON pr.promotion_id=p.id GROUP BY p.id ORDER BY p.created_at DESC LIMIT 500`);
  res.json({promotions:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/promotions', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req,res,next)=>{try{
  const input=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/),title:z.string().trim().min(2).max(120),description:z.string().max(1000).optional(),discountType:z.enum(['PERCENT','FLAT']),discountValue:z.number().int().positive(),maxDiscountPaise:z.number().int().positive().optional().nullable(),minOrderPaise:z.number().int().nonnegative().default(0),usageLimit:z.number().int().positive().optional().nullable(),perCustomerLimit:z.number().int().positive().default(1),startsAt:z.string().datetime().optional(),endsAt:z.string().datetime().optional().nullable()}).parse(req.body);
  if(input.discountType==='PERCENT' && input.discountValue>100) throw new Error('INVALID_PERCENT_DISCOUNT');
  const r=await query(`INSERT INTO promotions(code,title,description,discount_type,discount_value,max_discount_paise,min_order_paise,usage_limit,per_customer_limit,starts_at,ends_at,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,NOW()),$11::timestamptz,$12) RETURNING *`,[input.code,input.title,input.description??null,input.discountType,input.discountValue,input.maxDiscountPaise??null,input.minOrderPaise,input.usageLimit??null,input.perCustomerLimit,input.startsAt??null,input.endsAt??null,req.authUser!.id]);
  await audit('PROMOTION_CREATED','promotions',r.rows[0].id,req.authUser!.id,{code:input.code}); res.status(201).json({promotion:r.rows[0]});
}catch(e){next(e)}});

router.patch('/promotions/:id', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=z.object({isActive:z.boolean(),endsAt:z.string().datetime().optional().nullable()}).parse(req.body);
  const r=await query(`UPDATE promotions SET is_active=$1,ends_at=COALESCE($2::timestamptz,ends_at),updated_at=NOW() WHERE id=$3 RETURNING *`,[input.isActive,input.endsAt??null,id]);
  if(!r.rows[0]){res.status(404).json({error:'PROMOTION_NOT_FOUND'});return;} await audit('PROMOTION_UPDATED','promotions',id,req.authUser!.id,input); res.json({promotion:r.rows[0]});
}catch(e){next(e)}});

router.get('/settlements', requirePermission('VIEW_SETTLEMENTS'), async (_req,res,next)=>{try{
  const [v,d]=await Promise.all([
    query(`SELECT s.*,v.name vendor_name FROM vendor_settlements s JOIN vendors v ON v.id=s.vendor_id ORDER BY s.created_at DESC LIMIT 500`),
    query(`SELECT s.*,u.name partner_name FROM delivery_settlements s JOIN delivery_partners dp ON dp.id=s.delivery_partner_id JOIN users u ON u.id=dp.user_id ORDER BY s.created_at DESC LIMIT 500`)
  ]); res.json({vendors:v.rows,delivery:d.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/settlements/generate', requirePermission('MANAGE_SETTLEMENTS'), async (req,res,next)=>{try{
  const input=z.object({periodStart:z.string().date(),periodEnd:z.string().date()}).parse(req.body);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const vendors=await client.query(`SELECT v.id,COALESCE(SUM(o.total_paise) FILTER(WHERE o.status='DELIVERED'),0)::bigint gross,COALESCE(SUM(o.platform_fee_paise) FILTER(WHERE o.status='DELIVERED'),0)::bigint fees,COALESCE(SUM(o.platform_gst_paise) FILTER(WHERE o.status='DELIVERED'),0)::bigint gst,COALESCE((SELECT SUM(r.amount_paise) FROM refunds r JOIN orders ro ON ro.id=r.order_id WHERE ro.vendor_id=v.id AND r.status='PROCESSED' AND ro.created_at::date BETWEEN $1::date AND $2::date),0)::bigint refunds FROM vendors v LEFT JOIN orders o ON o.vendor_id=v.id AND o.created_at::date BETWEEN $1::date AND $2::date GROUP BY v.id`,[input.periodStart,input.periodEnd]);
    for(const x of vendors.rows){const net=Math.max(0,Number(x.gross)-Number(x.fees)-Number(x.gst)-Number(x.refunds));await client.query(`INSERT INTO vendor_settlements(vendor_id,period_start,period_end,gross_sales_paise,platform_fee_paise,gst_paise,refunds_paise,net_payout_paise) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(vendor_id,period_start,period_end) DO UPDATE SET gross_sales_paise=EXCLUDED.gross_sales_paise,platform_fee_paise=EXCLUDED.platform_fee_paise,gst_paise=EXCLUDED.gst_paise,refunds_paise=EXCLUDED.refunds_paise,net_payout_paise=EXCLUDED.net_payout_paise`,[x.id,input.periodStart,input.periodEnd,x.gross,x.fees,x.gst,x.refunds,net]);}
    const partners=await client.query(`SELECT dp.id,COALESCE(SUM(da.earning_paise),0)::bigint base,COALESCE(SUM(da.bonus_paise),0)::bigint bonus FROM delivery_partners dp LEFT JOIN delivery_assignments da ON da.delivery_partner_id=dp.id AND da.status='DELIVERED' AND da.delivered_at::date BETWEEN $1::date AND $2::date GROUP BY dp.id`,[input.periodStart,input.periodEnd]);
    for(const x of partners.rows){const net=Number(x.base)+Number(x.bonus);await client.query(`INSERT INTO delivery_settlements(delivery_partner_id,period_start,period_end,base_earning_paise,bonus_paise,net_payout_paise) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(delivery_partner_id,period_start,period_end) DO UPDATE SET base_earning_paise=EXCLUDED.base_earning_paise,bonus_paise=EXCLUDED.bonus_paise,net_payout_paise=EXCLUDED.net_payout_paise`,[x.id,input.periodStart,input.periodEnd,x.base,x.bonus,net]);}
    await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await audit('SETTLEMENTS_GENERATED','settlements',null,req.authUser!.id,input); res.json({ok:true,periodStart:input.periodStart,periodEnd:input.periodEnd});
}catch(e){next(e)}});

router.get('/risk', async (_req,res,next)=>{try{
  const r=await query(`SELECT rf.*,u.name customer_name,cp.customer_code FROM risk_flags rf LEFT JOIN users u ON u.id=rf.user_id LEFT JOIN customer_profiles cp ON cp.user_id=rf.user_id WHERE rf.status='OPEN' ORDER BY CASE rf.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,rf.created_at DESC LIMIT 500`); res.json({flags:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/risk/scan', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req,res,next)=>{try{
  const customers=await query<{user_id:string;order_count:number;cancel_count:number;refund_count:number;customer_code:string}>(`SELECT u.id user_id,COUNT(o.id)::int order_count,COUNT(o.id) FILTER(WHERE o.status='CANCELLED')::int cancel_count,COUNT(o.id) FILTER(WHERE o.status='REFUNDED')::int refund_count,cp.customer_code FROM users u JOIN customer_profiles cp ON cp.user_id=u.id LEFT JOIN orders o ON o.customer_id=u.id AND o.created_at>=NOW()-INTERVAL '30 days' WHERE u.role='CUSTOMER' GROUP BY u.id,cp.customer_code HAVING COUNT(o.id)>=5`);
  let created=0; for(const c of customers.rows){const score=Math.min(100,c.cancel_count*12+c.refund_count*15);if(score<60)continue;const severity=score>=85?'CRITICAL':score>=70?'HIGH':'MEDIUM';const existing=await query(`SELECT id FROM risk_flags WHERE user_id=$1 AND risk_type='ORDER_BEHAVIOR' AND status='OPEN' LIMIT 1`,[c.user_id]);if(existing.rows[0])continue;await query(`INSERT INTO risk_flags(user_id,risk_type,score,severity,reason) VALUES($1,'ORDER_BEHAVIOR',$2,$3,$4)`,[c.user_id,score,severity,`30-day pattern: ${c.cancel_count} cancellations and ${c.refund_count} refunds across ${c.order_count} orders.`]);created++;}
  await audit('RISK_SCAN_RUN','risk_flags',null,req.authUser!.id,{created});res.json({created});
}catch(e){next(e)}});

router.patch('/risk/:id', requirePermission('MANAGE_SYSTEM_CONFIG'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=z.object({status:z.enum(['REVIEWED','RESOLVED','DISMISSED']),note:z.string().trim().max(1000).optional()}).parse(req.body);
  const r=await query(`UPDATE risk_flags SET status=$1,reviewed_by=$2,reviewed_at=NOW(),reason=CASE WHEN $3::text IS NULL OR $3='' THEN reason ELSE reason||' | Review: '||$3 END WHERE id=$4 RETURNING *`,[input.status,req.authUser!.id,input.note??null,id]);if(!r.rows[0]){res.status(404).json({error:'RISK_FLAG_NOT_FOUND'});return;}await audit('RISK_FLAG_UPDATED','risk_flags',id,req.authUser!.id,input);res.json({flag:r.rows[0]});
}catch(e){next(e)}});

export default router;
