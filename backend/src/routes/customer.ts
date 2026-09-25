import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { query, pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { recordOrderEvent } from '../services/orders/events.js';
import { postPlatformRevenueWithClient } from '../services/finance/ledger.js';
import { creditWalletForRefund } from '../services/commerce/wallet.js';
import { revealDeliveryOtp } from '../services/fulfillment/delivery-otp.js';
import { releaseInventoryForOrder } from '../services/commerce/inventory.js';
import { debitWalletForOrder } from '../services/commerce/wallet.js';

const router = Router();
router.use(requireAuth, requireRoles('CUSTOMER','SUPER_ADMIN','ADMIN'));

const locationSchema = z.object({ latitude: z.coerce.number().min(-90).max(90), longitude: z.coerce.number().min(-180).max(180) });
const cartSchema = z.object({ vendorId: z.string().uuid(), items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).max(100) });
const orderSchema = z.object({
  vendorId: z.string().uuid(),
  addressId: z.string().uuid(),
  paymentMethod: z.enum(['UPI','CARD','COD']),
  promotionCode: z.string().trim().toUpperCase().max(40).optional().nullable(),
  useWallet: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(255).optional()
});

function haversineKm(aLat:number,aLon:number,bLat:number,bLon:number){
  const r = 6371; const rad=(x:number)=>x*Math.PI/180;
  const dLat=rad(bLat-aLat), dLon=rad(bLon-aLon);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(aLat))*Math.cos(rad(bLat))*Math.sin(dLon/2)**2;
  return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}


async function validateTargetedPromotion(client:any, promotion:any, userId:string, vendorId:string):Promise<string|null>{
  if(promotion.vendor_id && promotion.vendor_id!==vendorId) return 'PROMOTION_VENDOR_MISMATCH';
  const delivered=await client.query(`SELECT COUNT(*) FILTER(WHERE status='DELIVERED')::text orders,COALESCE(SUM(total_paise) FILTER(WHERE status='DELIVERED'),0)::text spend FROM orders WHERE customer_id=$1`,[userId]);
  const orders=Number(delivered.rows[0]?.orders??0), spend=Number(delivered.rows[0]?.spend??0);
  if(Number(promotion.min_orders||0)>orders) return 'PROMOTION_ORDER_HISTORY_REQUIREMENT';
  if(Number(promotion.min_spend_paise||0)>spend) return 'PROMOTION_SPEND_REQUIREMENT';
  if(promotion.audience==='NEW_CUSTOMER' && orders>0) return 'PROMOTION_NEW_CUSTOMER_ONLY';
  if(promotion.audience==='REPEAT_CUSTOMER' && orders<2) return 'PROMOTION_REPEAT_CUSTOMER_ONLY';
  if(promotion.audience==='MEMBERS' && !(await client.query(`SELECT 1 FROM customer_memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`,[userId])).rows[0]) return 'PROMOTION_MEMBERS_ONLY';
  if(promotion.membership_required && !(await client.query(`SELECT 1 FROM customer_memberships WHERE user_id=$1 AND status='ACTIVE' LIMIT 1`,[userId])).rows[0]) return 'PROMOTION_MEMBERSHIP_REQUIRED';
  if(Number(promotion.loyalty_min_points||0)>0){
    const loyalty=await client.query(`SELECT points FROM loyalty_accounts WHERE user_id=$1 LIMIT 1`,[userId]);
    if(Number(loyalty.rows[0]?.points??0)<Number(promotion.loyalty_min_points)) return 'PROMOTION_LOYALTY_REQUIREMENT';
  }
  if(promotion.category_id){
    const match=await client.query(`SELECT 1 FROM customer_carts cc JOIN cart_items ci ON ci.cart_id=cc.id JOIN products p ON p.id=ci.product_id WHERE cc.customer_id=$1 AND cc.vendor_id=$2 AND p.category_id=$3 LIMIT 1`,[userId,vendorId,promotion.category_id]);
    if(!match.rows[0]) return 'PROMOTION_CATEGORY_MISMATCH';
  }
  if(promotion.service_zone_id){
    const match=await client.query(`SELECT 1 FROM vendor_service_zones WHERE vendor_id=$1 AND service_zone_id=$2 LIMIT 1`,[vendorId,promotion.service_zone_id]);
    if(!match.rows[0]) return 'PROMOTION_ZONE_MISMATCH';
  }
  return null;
}

router.post('/serviceability', async (req,res,next)=>{ try {
  const input=locationSchema.parse(req.body);
  const zones=await query<{id:string;city:string;name:string;radius_m:number|null;center_latitude:number|null;center_longitude:number|null}>('SELECT id,city,name,radius_m,center_latitude,center_longitude FROM service_zones WHERE is_active=true');
  const matches=zones.rows.filter(z=>z.center_latitude!=null&&z.center_longitude!=null&&z.radius_m!=null&&haversineKm(input.latitude,input.longitude,Number(z.center_latitude),Number(z.center_longitude))*1000<=Number(z.radius_m));
  res.json({serviceable:matches.length>0,zones:matches.map(z=>({id:z.id,city:z.city,name:z.name})),mode:'database'});
 } catch(e){ next(e); } });

router.get('/categories', async (_req,res,next)=>{ try {
  const r=await query('SELECT id,name,slug,icon_key,sort_order FROM categories WHERE is_active=true ORDER BY sort_order ASC,name ASC');
  res.json({categories:r.rows,mode:'database'});
 } catch(e){next(e);} });

router.get('/vendors', async (req,res,next)=>{ try {
  const q=z.object({latitude:z.coerce.number().optional(),longitude:z.coerce.number().optional(),category:z.string().optional(),q:z.string().trim().max(120).optional(),limit:z.coerce.number().int().min(1).max(100).default(30)}).parse(req.query);
  const r=await query(`SELECT v.id,v.name,v.slug,v.rating,v.review_count,v.is_open,v.locality,v.city,v.latitude,v.longitude,v.plan_id, vp.name AS plan_name
    FROM vendors v LEFT JOIN vendor_plans vp ON vp.id=v.plan_id
    WHERE v.status='ACTIVE' AND ($1::text IS NULL OR v.name ILIKE '%'||$1||'%' OR v.locality ILIKE '%'||$1||'%' OR v.city ILIKE '%'||$1||'%')
    ORDER BY v.rating DESC,v.review_count DESC LIMIT $2`,[q.q??null,q.limit]);
  let vendors=r.rows;
  if(q.latitude!=null&&q.longitude!=null){ vendors=vendors.map((v:any)=>({...v,distance_km:v.latitude!=null&&v.longitude!=null?haversineKm(q.latitude!,q.longitude!,Number(v.latitude),Number(v.longitude)):null})).sort((a:any,b:any)=>(a.distance_km??999)-(b.distance_km??999)); }
  res.json({vendors,mode:'database'});
 } catch(e){next(e);} });

router.get('/vendors/:id/products', async (req,res,next)=>{ try {
  const vendorId=z.string().uuid().parse(req.params.id);
  const filters=z.object({category:z.string().optional(),q:z.string().trim().max(120).optional()}).parse(req.query);
  const r=await query(`SELECT p.id,p.vendor_id,p.name,p.description,p.unit_label,p.price_paise,p.compare_at_price_paise,p.image_url,p.stock_qty,p.is_active,c.name AS category_name,c.slug AS category_slug
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.vendor_id=$1 AND p.is_active=true AND p.stock_qty>0
      AND ($2::text IS NULL OR c.slug=$2 OR c.name ILIKE '%'||$2||'%')
      AND ($3::text IS NULL OR p.name ILIKE '%'||$3||'%' OR p.description ILIKE '%'||$3||'%')
    ORDER BY p.name`,[vendorId,filters.category??null,filters.q??null]);
  res.json({products:r.rows,mode:'database'});
 } catch(e){next(e);} });

router.get('/cart', async (req,res,next)=>{ try {
  const r=await query(`SELECT cc.id cart_id,cc.vendor_id, p.id product_id,p.name,p.price_paise,p.image_url,ci.quantity FROM customer_carts cc
    LEFT JOIN cart_items ci ON ci.cart_id=cc.id LEFT JOIN products p ON p.id=ci.product_id WHERE cc.customer_id=$1 ORDER BY p.name`,[req.authUser!.id]);
  res.json({cart:r.rows[0] ? {cartId:r.rows[0].cart_id,vendorId:r.rows[0].vendor_id,items:r.rows.map((x:any)=>({productId:x.product_id,name:x.name,pricePaise:Number(x.price_paise),imageUrl:x.image_url,quantity:x.quantity}))} : {cartId:null,vendorId:null,items:[]},mode:'database'});
 } catch(e){next(e);} });

router.put('/cart', async (req,res,next)=>{ const client=await pool.connect(); try {
  const input=cartSchema.parse(req.body); await client.query('BEGIN');
  const cart=await client.query<{id:string}>('INSERT INTO customer_carts(customer_id,vendor_id) VALUES($1,$2) ON CONFLICT(customer_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id,updated_at=NOW() RETURNING id',[req.authUser!.id,input.vendorId]);
  const cartId=cart.rows[0]!.id; await client.query('DELETE FROM cart_items WHERE cart_id=$1',[cartId]);
  for(const item of input.items){ await client.query('INSERT INTO cart_items(cart_id,product_id,quantity) VALUES($1,$2,$3)',[cartId,item.productId,item.quantity]); }
  await client.query('COMMIT'); res.json({saved:true,cartId});
 } catch(e){ await client.query('ROLLBACK'); next(e);} finally{client.release();} });



const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().email().optional().nullable(),
  preferredLanguage: z.string().trim().min(2).max(12).optional(),
  marketingOptIn: z.boolean().optional()
}).strict();

const addressSchema = z.object({
  label: z.string().trim().min(1).max(40).default('Home'),
  line1: z.string().trim().min(3).max(255),
  line2: z.string().trim().max(255).optional().nullable(),
  locality: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().min(3).max(20),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  isDefault: z.boolean().default(false)
}).strict();

const notificationPreferencesSchema = z.object({
  orderUpdates: z.boolean().optional(),
  deliveryUpdates: z.boolean().optional(),
  paymentUpdates: z.boolean().optional(),
  supportUpdates: z.boolean().optional(),
  promotions: z.boolean().optional(),
  productOffers: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  smsEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional()
}).strict();

router.patch('/profile', async (req,res,next)=>{ try {
  const input=profileUpdateSchema.parse(req.body);
  const userId=req.authUser!.id;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    if(input.name !== undefined || input.email !== undefined){
      await client.query(`UPDATE users SET name=COALESCE($1,name), email=$2, updated_at=NOW() WHERE id=$3 AND role='CUSTOMER'`, [input.name ?? null, input.email ?? null, userId]);
    }
    if(input.preferredLanguage !== undefined || input.marketingOptIn !== undefined){
      await client.query(`UPDATE customer_profiles SET preferred_language=COALESCE($1,preferred_language), marketing_opt_in=COALESCE($2,marketing_opt_in), updated_at=NOW() WHERE user_id=$3`, [input.preferredLanguage ?? null, input.marketingOptIn ?? null, userId]);
    }
    await client.query('COMMIT');
  } catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  await audit('CUSTOMER_PROFILE_UPDATED','customer_profiles',userId,userId,{fields:Object.keys(input)});
  res.json({ok:true});
} catch(e){next(e);} });

router.get('/addresses', async (req,res,next)=>{ try {
  const r=await query(`SELECT id,label,line1,line2,locality,city,state,postal_code,latitude,longitude,is_default,created_at,updated_at FROM addresses WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC`,[req.authUser!.id]);
  res.json({addresses:r.rows,mode:'database'});
} catch(e){next(e);} });

router.post('/addresses', async (req,res,next)=>{ const client=await pool.connect(); try {
  const input=addressSchema.parse(req.body); const userId=req.authUser!.id;
  await client.query('BEGIN');
  if(input.isDefault) await client.query('UPDATE addresses SET is_default=false,updated_at=NOW() WHERE user_id=$1',[userId]);
  const r=await client.query(`INSERT INTO addresses(user_id,label,line1,line2,locality,city,state,postal_code,latitude,longitude,is_default) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[userId,input.label,input.line1,input.line2??null,input.locality??null,input.city,input.state,input.postalCode,input.latitude??null,input.longitude??null,input.isDefault]);
  await client.query('COMMIT'); const address=r.rows[0]; await audit('CUSTOMER_ADDRESS_CREATED','addresses',address.id,userId,{isDefault:input.isDefault}); res.status(201).json({address});
} catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });

router.patch('/addresses/:id', async (req,res,next)=>{ const client=await pool.connect(); try {
  const id=z.string().uuid().parse(req.params.id); const input=addressSchema.partial().parse(req.body); const userId=req.authUser!.id;
  await client.query('BEGIN');
  const current=await client.query('SELECT * FROM addresses WHERE id=$1 AND user_id=$2',[id,userId]); if(!current.rows[0]){res.status(404).json({error:'ADDRESS_NOT_FOUND'});await client.query('ROLLBACK');return;}
  if(input.isDefault===true) await client.query('UPDATE addresses SET is_default=false,updated_at=NOW() WHERE user_id=$1',[userId]);
  const merged={...current.rows[0],...input,postal_code:input.postalCode??current.rows[0].postal_code,is_default:input.isDefault??current.rows[0].is_default};
  const r=await client.query(`UPDATE addresses SET label=$1,line1=$2,line2=$3,locality=$4,city=$5,state=$6,postal_code=$7,latitude=$8,longitude=$9,is_default=$10,updated_at=NOW() WHERE id=$11 AND user_id=$12 RETURNING *`,[merged.label,merged.line1,merged.line2??null,merged.locality??null,merged.city,merged.state,merged.postal_code,merged.latitude??null,merged.longitude??null,merged.is_default,id,userId]);
  await client.query('COMMIT'); await audit('CUSTOMER_ADDRESS_UPDATED','addresses',id,userId,{fields:Object.keys(input)}); res.json({address:r.rows[0]});
} catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });

router.delete('/addresses/:id', async (req,res,next)=>{ try {
  const id=z.string().uuid().parse(req.params.id); const userId=req.authUser!.id;
  const r=await query('DELETE FROM addresses WHERE id=$1 AND user_id=$2 RETURNING id,is_default',[id,userId]); if(!r.rows[0]){res.status(404).json({error:'ADDRESS_NOT_FOUND'});return;}
  if(r.rows[0].is_default){
    await query(`UPDATE addresses SET is_default=true,updated_at=NOW() WHERE id=(SELECT id FROM addresses WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 1)`,[userId]);
  }
  await audit('CUSTOMER_ADDRESS_DELETED','addresses',id,userId,{}); res.status(204).send();
} catch(e){next(e);} });

router.get('/notification-preferences', async (req,res,next)=>{ try {
  await query(`INSERT INTO customer_notification_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,[req.authUser!.id]);
  const r=await query(`SELECT order_updates,delivery_updates,payment_updates,support_updates,promotions,product_offers,push_enabled,whatsapp_enabled,sms_enabled,email_enabled FROM customer_notification_preferences WHERE user_id=$1`,[req.authUser!.id]);
  res.json({preferences:r.rows[0]});
} catch(e){next(e);} });

router.patch('/notification-preferences', async (req,res,next)=>{ try {
  const input=notificationPreferencesSchema.parse(req.body); const userId=req.authUser!.id;
  await query(`INSERT INTO customer_notification_preferences(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,[userId]);
  const fields: string[]=[]; const params: unknown[]=[]; let i=1;
  const map: Record<string,string>={orderUpdates:'order_updates',deliveryUpdates:'delivery_updates',paymentUpdates:'payment_updates',supportUpdates:'support_updates',promotions:'promotions',productOffers:'product_offers',pushEnabled:'push_enabled',whatsappEnabled:'whatsapp_enabled',smsEnabled:'sms_enabled',emailEnabled:'email_enabled'};
  for(const [k,v] of Object.entries(input)){ if(v===undefined) continue; fields.push(`${map[k]}=$${i++}`); params.push(v); }
  if(fields.length) { params.push(userId); await query(`UPDATE customer_notification_preferences SET ${fields.join(',')},updated_at=NOW() WHERE user_id=$${i}`,params); }
  await audit('CUSTOMER_NOTIFICATION_PREFERENCES_UPDATED','customer_notification_preferences',userId,userId,{fields:Object.keys(input)});
  res.json({ok:true});
} catch(e){next(e);} });

router.get('/profile', async (req,res,next)=>{ try {
  const userId=req.authUser!.id;
  const profile=await query(`
    SELECT u.id AS user_id, cp.customer_code, u.name, u.phone, u.email, u.is_active,
           u.created_at, cp.preferred_language, cp.marketing_opt_in, cp.last_active_at,
           COALESCE(stats.order_count,0)::int AS order_count,
           COALESCE(stats.active_order_count,0)::int AS active_order_count,
           COALESCE(stats.total_spend_paise,0)::bigint AS total_spend_paise,
           stats.last_order_at,
           COALESCE(tix.ticket_count,0)::int AS ticket_count,
           COALESCE(addr.address_count,0)::int AS address_count
    FROM users u
    JOIN customer_profiles cp ON cp.user_id=u.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int order_count,
             COUNT(*) FILTER (WHERE status NOT IN ('DELIVERED','CANCELLED','REFUNDED'))::int active_order_count,
             COALESCE(SUM(total_paise) FILTER (WHERE status NOT IN ('CANCELLED','REFUNDED')),0)::bigint total_spend_paise,
             MAX(created_at) last_order_at
      FROM orders WHERE customer_id=u.id
    ) stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int ticket_count FROM support_tickets WHERE requester_user_id=u.id
    ) tix ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int address_count FROM addresses WHERE user_id=u.id
    ) addr ON TRUE
    WHERE u.id=$1 AND u.role='CUSTOMER' LIMIT 1
  `,[userId]);
  if(!profile.rows[0]){res.status(404).json({error:'CUSTOMER_PROFILE_NOT_FOUND'});return;}
  const addresses=await query(`SELECT id,label,line1,line2,locality,city,state,postal_code,latitude,longitude,is_default,created_at,updated_at FROM addresses WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC`,[userId]);
  const tickets=await query(`SELECT id,subject,status,priority,order_id,created_at,updated_at FROM support_tickets WHERE requester_user_id=$1 ORDER BY updated_at DESC LIMIT 20`,[userId]);
  const deviceSummary=await query(`SELECT COUNT(*) FILTER (WHERE is_active=true)::int active_tokens, ARRAY_AGG(DISTINCT platform) FILTER (WHERE is_active=true) platforms FROM device_tokens WHERE user_id=$1`,[userId]);
  res.json({profile:profile.rows[0],addresses:addresses.rows,tickets:tickets.rows,deviceSummary:deviceSummary.rows[0]??{active_tokens:0,platforms:[]},mode:'database'});
}catch(e){next(e);} });

router.get('/orders', async (req,res,next)=>{ try {
  const r=await query(`SELECT o.id,o.status,o.subtotal_paise,o.delivery_fee_paise,o.platform_fee_paise,o.platform_gst_paise,o.total_paise,o.created_at,v.name AS vendor_name
    FROM orders o JOIN vendors v ON v.id=o.vendor_id WHERE o.customer_id=$1 ORDER BY o.created_at DESC LIMIT 100`,[req.authUser!.id]);
  res.json({orders:r.rows,mode:'database'});
 }catch(e){next(e);} });

router.get('/personalized-feed', async (req,res,next)=>{ try {
  const customerId=req.authUser!.id;
  const [history,recommended,recent,offers]=await Promise.all([
    query<{orders:number;delivered_orders:number;avg_order_paise:string;last_order_at:string|null}>(`
      SELECT COUNT(*)::int orders,
             COUNT(*) FILTER(WHERE status='DELIVERED')::int delivered_orders,
             COALESCE(AVG(total_paise) FILTER(WHERE status IN ('DELIVERED','PAID','COD_CONFIRMED')),0)::bigint avg_order_paise,
             MAX(created_at) last_order_at
      FROM orders WHERE customer_id=$1`,[customerId]),
    query(`
      WITH top_categories AS (
        SELECT p.category_id,COUNT(*)::int purchases
        FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id
        WHERE o.customer_id=$1 AND o.status='DELIVERED' AND p.category_id IS NOT NULL
        GROUP BY p.category_id ORDER BY purchases DESC LIMIT 5
      ), purchased AS (
        SELECT DISTINCT oi.product_id
        FROM order_items oi JOIN orders o ON o.id=oi.order_id
        WHERE o.customer_id=$1 AND o.status='DELIVERED'
      )
      SELECT p.id,p.vendor_id,p.name,p.unit_label,p.price_paise,p.compare_at_price_paise,p.image_url,p.stock_qty,p.is_active,
             c.name category_name,v.name vendor_name,tc.purchases category_purchases
      FROM products p JOIN categories c ON c.id=p.category_id JOIN vendors v ON v.id=p.vendor_id
      JOIN top_categories tc ON tc.category_id=p.category_id
      LEFT JOIN purchased pu ON pu.product_id=p.id
      WHERE p.is_active=true AND p.stock_qty>0 AND v.status='ACTIVE' AND pu.product_id IS NULL
      ORDER BY tc.purchases DESC,p.updated_at DESC LIMIT 24`,[customerId]),
    query(`
      SELECT p.id,p.vendor_id,p.name,p.unit_label,p.price_paise,p.image_url,p.stock_qty,p.is_active,
             c.name category_name,v.name vendor_name,MAX(o.created_at) last_ordered_at
      FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id
      JOIN vendors v ON v.id=p.vendor_id LEFT JOIN categories c ON c.id=p.category_id
      WHERE o.customer_id=$1 AND o.status='DELIVERED' AND p.is_active=true
      GROUP BY p.id,v.id,c.id ORDER BY MAX(o.created_at) DESC LIMIT 12`,[customerId]),
    query(`
      SELECT p.id,p.code,p.title,p.description,p.discount_type,p.discount_value,p.max_discount_paise,p.min_order_paise,p.starts_at,p.ends_at,
             CASE WHEN p.discount_type='PERCENT' THEN p.discount_value ELSE p.discount_value/100.0 END relevance
      FROM promotions p
      WHERE p.is_active=true AND p.starts_at<=NOW() AND (p.ends_at IS NULL OR p.ends_at>NOW())
        AND (p.usage_limit IS NULL OR (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id=p.id)<p.usage_limit)
        AND (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id=p.id AND pr.user_id=$1)<p.per_customer_limit
        AND (p.audience='ALL' OR (p.audience='NEW_CUSTOMER' AND NOT EXISTS(SELECT 1 FROM orders no WHERE no.customer_id=$1 AND no.status='DELIVERED')) OR (p.audience='REPEAT_CUSTOMER' AND (SELECT COUNT(*) FROM orders ro WHERE ro.customer_id=$1 AND ro.status='DELIVERED')>=2) OR (p.audience='MEMBERS' AND EXISTS(SELECT 1 FROM customer_memberships cm WHERE cm.user_id=$1 AND cm.status='ACTIVE')))
        AND (p.membership_required=false OR EXISTS(SELECT 1 FROM customer_memberships cm WHERE cm.user_id=$1 AND cm.status='ACTIVE'))
        AND (p.min_orders=0 OR (SELECT COUNT(*) FROM orders mo WHERE mo.customer_id=$1 AND mo.status='DELIVERED')>=p.min_orders)
        AND (p.min_spend_paise=0 OR (SELECT COALESCE(SUM(total_paise),0) FROM orders so WHERE so.customer_id=$1 AND so.status='DELIVERED')>=p.min_spend_paise)
        AND (p.loyalty_min_points=0 OR EXISTS(SELECT 1 FROM loyalty_accounts la WHERE la.user_id=$1 AND la.points>=p.loyalty_min_points))
      ORDER BY CASE WHEN p.min_order_paise <= COALESCE((SELECT AVG(o2.total_paise) FROM orders o2 WHERE o2.customer_id=$1 AND o2.status IN ('DELIVERED','PAID','COD_CONFIRMED')),0) THEN 0 ELSE 1 END,
               relevance DESC,p.created_at DESC LIMIT 10`,[customerId])
  ]);
  res.json({stats:history.rows[0],recommended:recommended.rows,recentlyBought:recent.rows,offers:offers.rows,mode:'database'});
}catch(e){next(e);} });

router.get('/buy-again', async (req,res,next)=>{ try {
  const r=await query(`
    SELECT p.id product_id,p.vendor_id,p.name,p.unit_label,p.price_paise,p.image_url,p.stock_qty,p.is_active,
           v.name vendor_name,MAX(o.created_at) last_ordered_at,SUM(oi.quantity)::int total_quantity
    FROM order_items oi
    JOIN orders o ON o.id=oi.order_id
    JOIN products p ON p.id=oi.product_id
    JOIN vendors v ON v.id=p.vendor_id
    WHERE o.customer_id=$1 AND o.status='DELIVERED'
    GROUP BY p.id,v.id
    ORDER BY MAX(o.created_at) DESC
    LIMIT 40`,[req.authUser!.id]);
  res.json({items:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/orders/:id/reorder', async (req,res,next)=>{ const client=await pool.connect(); try {
  const orderId=req.params.id;
  await client.query('BEGIN');
  const source=await client.query<{id:string;vendor_id:string;status:string}>(`SELECT id,vendor_id,status::text FROM orders WHERE id=$1 AND customer_id=$2 FOR SHARE`,[orderId,req.authUser!.id]);
  if(!source.rows[0]){await client.query('ROLLBACK');res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  if(source.rows[0].status!=='DELIVERED'){await client.query('ROLLBACK');res.status(409).json({error:'REORDER_REQUIRES_DELIVERED_ORDER'});return;}
  const existing=await client.query<{vendor_id:string}>(`SELECT vendor_id FROM customer_carts WHERE customer_id=$1`,[req.authUser!.id]);
  if(existing.rows[0]?.vendor_id && existing.rows[0].vendor_id!==source.rows[0].vendor_id){await client.query('ROLLBACK');res.status(409).json({error:'CART_HAS_ANOTHER_VENDOR',vendorId:existing.rows[0].vendor_id});return;}
  const items=await client.query<{product_id:string;quantity:number;name:string;price_paise:string;stock_qty:number;is_active:boolean}>(`
    SELECT oi.product_id,oi.quantity,p.name,p.price_paise,p.stock_qty,p.is_active
    FROM order_items oi JOIN products p ON p.id=oi.product_id
    WHERE oi.order_id=$1 ORDER BY p.name`,[orderId]);
  const available=items.rows.filter(x=>x.is_active && Number(x.stock_qty)>0);
  if(!available.length){await client.query('ROLLBACK');res.status(409).json({error:'REORDER_PRODUCTS_UNAVAILABLE'});return;}
  const cart=await client.query<{id:string}>(`INSERT INTO customer_carts(customer_id,vendor_id) VALUES($1,$2) ON CONFLICT(customer_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id,updated_at=NOW() RETURNING id`,[req.authUser!.id,source.rows[0].vendor_id]);
  const cartId=cart.rows[0].id;
  const skipped:string[]=[]; const added:any[]=[];
  for(const item of items.rows){
    if(!item.is_active || Number(item.stock_qty)<=0){skipped.push(item.product_id);continue;}
    const qty=Math.min(Number(item.quantity),Number(item.stock_qty),99);
    await client.query(`INSERT INTO cart_items(cart_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=LEAST(cart_items.quantity+EXCLUDED.quantity,99)`,[cartId,item.product_id,qty]);
    added.push({productId:item.product_id,name:item.name,quantity:qty,pricePaise:Number(item.price_paise)});
  }
  await client.query('UPDATE customer_carts SET updated_at=NOW() WHERE id=$1',[cartId]);
  await client.query('COMMIT');
  await audit('CUSTOMER_REORDER_TO_CART','orders',orderId,req.authUser!.id,{cartId,addedCount:added.length,skippedCount:skipped.length});
  res.json({ok:true,cartId,vendorId:source.rows[0].vendor_id,added,skipped,mode:'database'});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client.release();} });

router.get('/orders/:id', async (req,res,next)=>{ try {
  const orderId=z.string().uuid().parse(req.params.id);
  const o=await query(`SELECT o.*,v.name AS vendor_name FROM orders o JOIN vendors v ON v.id=o.vendor_id WHERE o.id=$1 AND o.customer_id=$2 LIMIT 1`,[orderId,req.authUser!.id]);
  if(!o.rows[0]){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const items=await query(`SELECT oi.product_id,oi.quantity,oi.unit_price_paise,oi.line_total_paise,p.name,p.image_url FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=$1`,[orderId]);
  const delivery=await query(`SELECT id,status,delivery_partner_id,picked_up_at,delivered_at,proof FROM delivery_assignments WHERE order_id=$1 LIMIT 1`,[orderId]);
  res.json({order:o.rows[0],items:items.rows,delivery:delivery.rows[0]??null,mode:'database'});
 }catch(e){next(e);} });

router.get('/orders/:id/tracking', async (req,res,next)=>{ try {
  const orderId=z.string().uuid().parse(req.params.id);
  const row=await query(`SELECT o.id,o.status,o.updated_at,v.name AS vendor_name,v.latitude AS vendor_latitude,v.longitude AS vendor_longitude,da.id AS assignment_id,da.status AS delivery_status,dp.latitude AS courier_latitude,dp.longitude AS courier_longitude,dp.mode,da.picked_up_at,da.delivered_at FROM orders o JOIN vendors v ON v.id=o.vendor_id LEFT JOIN delivery_assignments da ON da.order_id=o.id LEFT JOIN delivery_partners dp ON dp.id=da.delivery_partner_id WHERE o.id=$1 AND o.customer_id=$2 LIMIT 1`,[orderId,req.authUser!.id]);
  if(!row.rows[0]){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const events=await query(`SELECT event_type,source,payload,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at DESC LIMIT 50`,[orderId]);
  res.json({tracking:row.rows[0],events:events.rows,mode:'database'});
} catch(e){next(e);} });

router.get('/orders/:id/delivery-code', async (req,res,next)=>{ try {
  const orderId=z.string().uuid().parse(req.params.id);
  const row=await query<{assignment_id:string;status:string}>(`SELECT da.id AS assignment_id,da.status FROM delivery_assignments da JOIN orders o ON o.id=da.order_id WHERE da.order_id=$1 AND o.customer_id=$2 LIMIT 1`,[orderId,req.authUser!.id]);
  if(!row.rows[0]){res.status(404).json({error:'DELIVERY_NOT_ASSIGNED'});return;}
  const code=await revealDeliveryOtp(row.rows[0].assignment_id,'DROP');
  if(!code){res.status(409).json({error:'DELIVERY_CODE_NOT_READY'});return;}
  res.json({orderId,assignmentId:row.rows[0].assignment_id,deliveryCode:code,mode:'secure-server-reveal'});
} catch(e){next(e);} });

router.get('/orders/:id/timeline', async (req,res,next)=>{ try {
  const orderId=z.string().uuid().parse(req.params.id);
  const owner=await query<{id:string}>('SELECT id FROM orders WHERE id=$1 AND customer_id=$2 LIMIT 1',[orderId,req.authUser!.id]);
  if(!owner.rows[0]){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const events=await query(`SELECT id,event_type,source,payload,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at ASC`,[orderId]);
  res.json({events:events.rows,mode:'database'});
} catch(e){next(e);} });

router.post('/orders/:id/cancel', async (req,res,next)=>{ const client=await pool.connect(); try {
  const orderId=z.string().uuid().parse(req.params.id);
  const reason=z.string().trim().min(2).max(255).default('Customer requested cancellation').parse(req.body?.reason);
  await client.query('BEGIN');
  const order=await client.query<{id:string;status:string;payment_status:string;total_paise:string;wallet_applied_paise:string}>(`SELECT o.id,o.status::text,p.status::text AS payment_status,o.total_paise,o.wallet_applied_paise FROM orders o LEFT JOIN LATERAL (SELECT status FROM payments WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1) p ON TRUE WHERE o.id=$1 AND o.customer_id=$2 FOR UPDATE`,[orderId,req.authUser!.id]);
  const row=order.rows[0]; if(!row){await client.query('ROLLBACK');res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const cancellable=['PLACED','PAYMENT_PENDING','COD_CONFIRMED','PAID'].includes(row.status);
  if(!cancellable){await client.query('ROLLBACK');res.status(409).json({error:'ORDER_NOT_CANCELLABLE',status:row.status});return;}
  await releaseInventoryForOrder(client, orderId);
  const walletRefund=Number(row.wallet_applied_paise||0);
  const cashfreeRefund=Math.max(0,Number(row.total_paise)-walletRefund);
  const needsProviderRefund=(row.payment_status==='PAID' || row.status==='PAID') && cashfreeRefund>0;
  const needsWalletRefund=walletRefund>0;
  const nextStatus=(needsProviderRefund||needsWalletRefund)?'REFUND_PENDING':'CANCELLED';
  await client.query(`UPDATE orders SET status=$1::order_status,cancelled_at=NOW(),cashfree_refund_paise=$2,wallet_refund_paise=$3,updated_at=NOW() WHERE id=$4`,[nextStatus,cashfreeRefund,walletRefund,orderId]);
  if(needsWalletRefund) await creditWalletForRefund(client,req.authUser!.id,walletRefund,orderId);
  if(needsProviderRefund) await client.query(`INSERT INTO refunds(order_id,amount_paise,status,reason,created_by) VALUES($1,$2,'PENDING',$3,$4) ON CONFLICT DO NOTHING`,[orderId,cashfreeRefund,reason,req.authUser!.id]);
  if(!needsProviderRefund && needsWalletRefund) await client.query(`UPDATE payments SET status='REFUNDED',updated_at=NOW() WHERE order_id=$1`,[orderId]);
  await client.query('COMMIT');
  await audit('CUSTOMER_ORDER_CANCELLED','orders',orderId,req.authUser!.id,{reason,refundRequired:needsProviderRefund||needsWalletRefund});
  await recordOrderEvent({orderId,eventType:nextStatus,source:'CUSTOMER_CHECKOUT',actorUserId:req.authUser!.id,payload:{reason,refundRequired:needsProviderRefund||needsWalletRefund}});
  res.json({cancelled:true,refundRequired:needsProviderRefund||needsWalletRefund,status:nextStatus});
} catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });

router.post('/checkout/quote', async (req,res,next)=>{ const client=await pool.connect(); try {
  const input=z.object({vendorId:z.string().uuid(),addressId:z.string().uuid(),promotionCode:z.string().trim().toUpperCase().max(40).optional().nullable(),useWallet:z.boolean().default(false)}).parse(req.body);
  await client.query('BEGIN');
  const address=await client.query('SELECT id FROM addresses WHERE id=$1 AND user_id=$2',[input.addressId,req.authUser!.id]);
  if(!address.rows[0]){await client.query('ROLLBACK');res.status(400).json({error:'INVALID_ADDRESS'});return;}
  const vendor=await client.query("SELECT id FROM vendors WHERE id=$1 AND status='ACTIVE'",[input.vendorId]);
  if(!vendor.rows[0]){await client.query('ROLLBACK');res.status(400).json({error:'VENDOR_NOT_AVAILABLE'});return;}
  const items=await client.query(`SELECT p.id,p.name,p.price_paise,ci.quantity,p.stock_qty FROM customer_carts cc JOIN cart_items ci ON ci.cart_id=cc.id JOIN products p ON p.id=ci.product_id WHERE cc.customer_id=$1 AND cc.vendor_id=$2 AND p.is_active=true ORDER BY p.name`,[req.authUser!.id,input.vendorId]);
  if(items.rows.length===0){await client.query('ROLLBACK');res.status(400).json({error:'CART_EMPTY'});return;}
  const subtotal=items.rows.reduce((s:any,x:any)=>s+Number(x.price_paise)*Number(x.quantity),0);
  let discount=0; let promotion:any=null;
  if(input.promotionCode){
    const r=await client.query(`SELECT p.*,COUNT(pr.id)::int total_redemptions,COUNT(pr.id) FILTER(WHERE pr.user_id=$1)::int customer_redemptions FROM promotions p LEFT JOIN promotion_redemptions pr ON pr.promotion_id=p.id WHERE p.code=$2 GROUP BY p.id FOR UPDATE`,[req.authUser!.id,input.promotionCode]);
    promotion=r.rows[0];
    if(!promotion){await client.query('ROLLBACK');res.status(404).json({error:'PROMOTION_NOT_FOUND'});return;}
    if(!promotion.is_active||new Date(promotion.starts_at)>new Date()||(promotion.ends_at&&new Date(promotion.ends_at)<=new Date())){await client.query('ROLLBACK');res.status(409).json({error:'PROMOTION_INACTIVE'});return;}
    if(promotion.usage_limit!=null&&Number(promotion.total_redemptions)>=Number(promotion.usage_limit)){await client.query('ROLLBACK');res.status(409).json({error:'PROMOTION_EXHAUSTED'});return;}
    if(Number(promotion.customer_redemptions)>=Number(promotion.per_customer_limit)){await client.query('ROLLBACK');res.status(409).json({error:'PROMOTION_CUSTOMER_LIMIT'});return;}
    if(subtotal<Number(promotion.min_order_paise)){await client.query('ROLLBACK');res.status(409).json({error:'PROMOTION_MIN_ORDER',minimumPaise:Number(promotion.min_order_paise)});return;}
    const targetError=await validateTargetedPromotion(client,promotion,req.authUser!.id,input.vendorId);
    if(targetError){await client.query('ROLLBACK');res.status(409).json({error:targetError});return;}
    discount=promotion.discount_type==='PERCENT'?Math.min(Number(promotion.max_discount_paise??Number.MAX_SAFE_INTEGER),Math.floor(subtotal*Number(promotion.discount_value)/100)):Math.min(subtotal,Number(promotion.discount_value));
  }
  const membership=await client.query<{id:string;benefits:any}>(`SELECT cm.id,mp.benefits FROM customer_memberships cm JOIN membership_plans mp ON mp.id=cm.plan_id WHERE cm.user_id=$1 AND cm.status='ACTIVE' ORDER BY cm.created_at DESC LIMIT 1`,[req.authUser!.id]);
  const benefits=membership.rows[0]?.benefits??{};
  const freeDeliveryMin=Number(benefits.freeDeliveryMinOrderPaise??19900);
  const standardDeliveryFee=subtotal>=29900?0:500;
  const deliveryFee=membership.rows[0] && subtotal>=freeDeliveryMin ? 0 : standardDeliveryFee;
  const platformFee=benefits.waivePlatformFee===true ? 0 : 100;
  const platformGst=platformFee===0 ? 0 : 18;
  const membershipDiscountPaise=(standardDeliveryFee-deliveryFee)+(100-platformFee)+((platformFee===0)?18:0);
  const beforeWallet=Math.max(0,subtotal-discount)+deliveryFee+platformFee+platformGst;
  const walletRow=await client.query<{balance_paise:string;is_active:boolean}>(`SELECT balance_paise,is_active FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`,[req.authUser!.id]);
  const walletBalance=walletRow.rows[0]?.is_active?Number(walletRow.rows[0].balance_paise):0;
  const walletApplied=input.useWallet?Math.min(walletBalance,beforeWallet):0;
  const payable=beforeWallet-walletApplied;
  await client.query('ROLLBACK');
  res.json({quote:{subtotalPaise:subtotal,discountPaise:discount,deliveryFeePaise:deliveryFee,platformFeePaise:platformFee,platformGstPaise:platformGst,walletBalancePaise:walletBalance,walletAppliedPaise:walletApplied,payablePaise:payable,promotionCode:promotion?.code??null,membershipId:membership.rows[0]?.id??null,membershipDiscountPaise,items:items.rows.map((x:any)=>({productId:x.id,name:x.name,quantity:x.quantity,unitPricePaise:Number(x.price_paise),stockQty:Number(x.stock_qty)}))},mode:'database'});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client.release();} });

router.post('/orders', async (req,res,next)=>{ const client=await pool.connect(); try {
  const input=orderSchema.parse({...req.body,idempotencyKey:req.body?.idempotencyKey ?? req.header('Idempotency-Key')}); await client.query('BEGIN');
  if(input.idempotencyKey){ const existing=await client.query('SELECT id,status,total_paise,discount_paise,wallet_applied_paise FROM orders WHERE idempotency_key=$1 LIMIT 1',[input.idempotencyKey]); if(existing.rows[0]){await client.query('COMMIT');res.json({order:existing.rows[0],reused:true});return;} }
  const address=await client.query('SELECT id FROM addresses WHERE id=$1 AND user_id=$2',[input.addressId,req.authUser!.id]); if(!address.rows[0]){res.status(400).json({error:'INVALID_ADDRESS'});await client.query('ROLLBACK');return;}
  const vendor=await client.query("SELECT id FROM vendors WHERE id=$1 AND status='ACTIVE'",[input.vendorId]); if(!vendor.rows[0]){res.status(400).json({error:'VENDOR_NOT_AVAILABLE'});await client.query('ROLLBACK');return;}
  const items=await client.query(`SELECT p.id,p.price_paise,p.stock_qty,ci.quantity FROM customer_carts cc JOIN cart_items ci ON ci.cart_id=cc.id JOIN products p ON p.id=ci.product_id WHERE cc.customer_id=$1 AND cc.vendor_id=$2 AND p.is_active=true FOR UPDATE`,[req.authUser!.id,input.vendorId]);
  if(items.rows.length===0){res.status(400).json({error:'CART_EMPTY'});await client.query('ROLLBACK');return;}
  for(const item of items.rows){if(Number(item.quantity)>Number(item.stock_qty)){res.status(409).json({error:'INSUFFICIENT_STOCK',productId:item.id});await client.query('ROLLBACK');return;}}
  const subtotal=items.rows.reduce((s:any,x:any)=>s+Number(x.price_paise)*Number(x.quantity),0);
  let discount=0; let promotion:any=null;
  if(input.promotionCode){
    const r=await client.query(`SELECT p.*,COUNT(pr.id)::int total_redemptions,COUNT(pr.id) FILTER(WHERE pr.user_id=$1)::int customer_redemptions FROM promotions p LEFT JOIN promotion_redemptions pr ON pr.promotion_id=p.id WHERE p.code=$2 GROUP BY p.id FOR UPDATE`,[req.authUser!.id,input.promotionCode]);
    promotion=r.rows[0]; if(!promotion){res.status(404).json({error:'PROMOTION_NOT_FOUND'});await client.query('ROLLBACK');return;}
    if(!promotion.is_active||new Date(promotion.starts_at)>new Date()||(promotion.ends_at&&new Date(promotion.ends_at)<=new Date())){res.status(409).json({error:'PROMOTION_INACTIVE'});await client.query('ROLLBACK');return;}
    if(promotion.usage_limit!=null&&Number(promotion.total_redemptions)>=Number(promotion.usage_limit)){res.status(409).json({error:'PROMOTION_EXHAUSTED'});await client.query('ROLLBACK');return;}
    if(Number(promotion.customer_redemptions)>=Number(promotion.per_customer_limit)){res.status(409).json({error:'PROMOTION_CUSTOMER_LIMIT'});await client.query('ROLLBACK');return;}
    if(subtotal<Number(promotion.min_order_paise)){res.status(409).json({error:'PROMOTION_MIN_ORDER',minimumPaise:Number(promotion.min_order_paise)});await client.query('ROLLBACK');return;}
    const targetError=await validateTargetedPromotion(client,promotion,req.authUser!.id,input.vendorId);
    if(targetError){res.status(409).json({error:targetError});await client.query('ROLLBACK');return;}
    discount=promotion.discount_type==='PERCENT'?Math.min(Number(promotion.max_discount_paise??Number.MAX_SAFE_INTEGER),Math.floor(subtotal*Number(promotion.discount_value)/100)):Math.min(subtotal,Number(promotion.discount_value));
  }
  const membership=await client.query<{id:string;benefits:any}>(`SELECT cm.id,mp.benefits FROM customer_memberships cm JOIN membership_plans mp ON mp.id=cm.plan_id WHERE cm.user_id=$1 AND cm.status='ACTIVE' ORDER BY cm.created_at DESC LIMIT 1`,[req.authUser!.id]);
  const benefits=membership.rows[0]?.benefits??{};
  const freeDeliveryMin=Number(benefits.freeDeliveryMinOrderPaise??19900);
  const standardDeliveryFee=subtotal>=29900?0:500;
  const deliveryFee=membership.rows[0] && subtotal>=freeDeliveryMin ? 0 : standardDeliveryFee;
  const platformFee=benefits.waivePlatformFee===true ? 0 : 100;
  const platformGst=platformFee===0 ? 0 : 18;
  const membershipDiscountPaise=(standardDeliveryFee-deliveryFee)+(100-platformFee)+((platformFee===0)?18:0);
  const beforeWallet=Math.max(0,subtotal-discount)+deliveryFee+platformFee+platformGst;
  const walletRow=await client.query<{balance_paise:string;is_active:boolean}>(`SELECT balance_paise,is_active FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`,[req.authUser!.id]);
  const walletBalance=walletRow.rows[0]?.is_active?Number(walletRow.rows[0].balance_paise):0;
  const walletApplied=input.useWallet?Math.min(walletBalance,beforeWallet):0;
  const total=beforeWallet-walletApplied;
  const status=total===0?'PAID':input.paymentMethod==='COD'?'COD_CONFIRMED':'PAYMENT_PENDING';
  const order=await client.query(`INSERT INTO orders(customer_id,vendor_id,delivery_address_id,status,subtotal_paise,delivery_fee_paise,platform_fee_paise,platform_gst_paise,total_paise,promotion_id,promotion_code,discount_paise,wallet_applied_paise,membership_id,membership_discount_paise,idempotency_key,placed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()) RETURNING id,status,total_paise,subtotal_paise,delivery_fee_paise,platform_fee_paise,platform_gst_paise,discount_paise,wallet_applied_paise,promotion_code,membership_id,membership_discount_paise`,[req.authUser!.id,input.vendorId,input.addressId,status,subtotal,deliveryFee,platformFee,platformGst,total,promotion?.id??null,promotion?.code??null,discount,walletApplied,membership.rows[0]?.id??null,membershipDiscountPaise,input.idempotencyKey??null]);
  const orderId=order.rows[0]!.id;
  for(const item of items.rows){
    await client.query('INSERT INTO order_items(order_id,product_id,quantity,unit_price_paise,line_total_paise) VALUES($1,$2,$3,$4,$5)',[orderId,item.id,item.quantity,item.price_paise,Number(item.price_paise)*Number(item.quantity)]);
    await client.query('UPDATE products SET stock_qty=stock_qty-$1,reserved_qty=reserved_qty+$1,updated_at=NOW() WHERE id=$2 AND stock_qty >= $1',[item.quantity,item.id]);
    await client.query('INSERT INTO inventory_reservations(order_id,product_id,quantity,status) VALUES($1,$2,$3,\'HELD\')',[orderId,item.id,item.quantity]);
  }
  if(walletApplied>0) await debitWalletForOrder(client,req.authUser!.id,walletApplied,orderId);
  await client.query(`INSERT INTO payments(order_id,method,status,provider,amount_paise,currency) VALUES($1,$2,$3,NULL,$4,'INR')`,[orderId,total===0?'WALLET':input.paymentMethod,status==='COD_CONFIRMED'?'AUTHORIZED':status==='PAID'?'PAID':'PENDING',total]);
  if(status==='COD_CONFIRMED'||status==='PAID') await postPlatformRevenueWithClient(client,orderId);
  if(promotion) await client.query(`INSERT INTO promotion_redemptions(promotion_id,user_id,order_id,discount_paise) VALUES($1,$2,$3,$4)`,[promotion.id,req.authUser!.id,orderId,discount]);
  await client.query('DELETE FROM cart_items WHERE cart_id=(SELECT id FROM customer_carts WHERE customer_id=$1)',[req.authUser!.id]);
  await client.query('UPDATE customer_carts SET vendor_id=NULL,updated_at=NOW() WHERE customer_id=$1',[req.authUser!.id]);
  await client.query('COMMIT');
  await audit('CUSTOMER_ORDER_CREATED','orders',orderId,req.authUser!.id,{vendorId:input.vendorId,paymentMethod:input.paymentMethod,discountPaise:discount,walletAppliedPaise:walletApplied,membershipDiscountPaise});
  await recordOrderEvent({orderId,eventType:status,source:'CUSTOMER_CHECKOUT',actorUserId:req.authUser!.id,payload:{discountPaise:discount,walletAppliedPaise:walletApplied,payablePaise:total}});
  res.status(201).json({order:order.rows[0]});
 }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e);}finally{client.release();} });

export default router;
