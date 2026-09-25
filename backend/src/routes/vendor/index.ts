import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/permissions.js';
import { query, pool } from '../../db/pool.js';
import { audit } from '../../services/audit.js';
import { releaseInventoryForOrder } from '../../services/commerce/inventory.js';
import { recordOrderEvent } from '../../services/orders/events.js';
import { assignNearestDeliveryPartner } from '../../services/fulfillment/dispatch.js';
import { revealDeliveryOtp } from '../../services/fulfillment/delivery-otp.js';

const router = Router();
router.use(requireAuth, requireRoles('VENDOR_OWNER','VENDOR_STAFF','SUPER_ADMIN','ADMIN','VENDOR_MANAGER'));

const productSchema = z.object({name:z.string().trim().min(2).max(255),categoryId:z.string().uuid().optional(),description:z.string().max(2000).optional(),unitLabel:z.string().max(80).default('1 unit'),priceRupees:z.number().nonnegative(),stockQty:z.number().int().nonnegative().default(0),imageUrl:z.string().url().optional(),isActive:z.boolean().optional()});

async function resolveVendorId(userId:string){
  if (userId.startsWith('dev-')) return null;
  const result=await query<{id:string}>(`SELECT id FROM vendors WHERE owner_user_id=$1 LIMIT 1`,[userId]);
  return result.rows[0]?.id??null;
}

router.get('/me', async (req,res,next)=>{try{
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`SELECT id,name,status,rating,review_count,is_open,phone,address_line1,locality,city,state,postal_code,latitude,longitude,plan_id FROM vendors WHERE id=$1`,[vendorId]);
  res.json({vendor:r.rows[0],mode:'database'});
}catch(e){next(e)}});

router.post('/status', async (req,res,next)=>{try{
  const isOpen=z.boolean().parse(req.body.isOpen);
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`UPDATE vendors SET is_open=$1,updated_at=NOW() WHERE id=$2 RETURNING id,is_open,updated_at`,[isOpen,vendorId]);
  if(!r.rows[0]){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  await audit('VENDOR_STORE_STATUS','vendors',vendorId,req.authUser!.id,{isOpen});
  res.json({vendor:r.rows[0]});
}catch(e){next(e)}});

router.post('/location', async (req,res,next)=>{try{
  const input=z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180)}).parse(req.body);
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`UPDATE vendors SET latitude=$1,longitude=$2,updated_at=NOW() WHERE id=$3 RETURNING id,latitude,longitude`,[input.latitude,input.longitude,vendorId]);
  res.json({location:r.rows[0]});
}catch(e){next(e)}});

router.get('/dashboard', async (req,res,next)=>{try{
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const [orders,sales,low,v]=await Promise.all([
    query<{count:string}>(`SELECT COUNT(*)::text count FROM orders WHERE vendor_id=$1 AND created_at >= CURRENT_DATE`,[vendorId]),
    query<{sum:string}>(`SELECT COALESCE(SUM(total_paise),0)::text sum FROM orders WHERE vendor_id=$1 AND status NOT IN ('CANCELLED','REFUNDED') AND created_at >= CURRENT_DATE`,[vendorId]),
    query<{count:string}>(`SELECT COUNT(*)::text count FROM products WHERE vendor_id=$1 AND stock_qty<10 AND is_active=true`,[vendorId]),
    query<{rating:string;review_count:number}>('SELECT rating,review_count FROM vendors WHERE id=$1',[vendorId])
  ]);
  res.json({ordersToday:Number(orders.rows[0]?.count??0),salesTodayPaise:Number(sales.rows[0]?.sum??0),lowStock:Number(low.rows[0]?.count??0),rating:Number(v.rows[0]?.rating??0),reviewCount:Number(v.rows[0]?.review_count??0),mode:'database'});
}catch(e){next(e)}});

router.get('/analytics', async (req,res,next)=>{try{
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const days=Math.min(90,Math.max(7,Number(req.query.days||30)));
  const [summary,customers,products]=await Promise.all([
    query(`SELECT COUNT(*)::int orders,COUNT(*) FILTER(WHERE status='DELIVERED')::int delivered,COALESCE(SUM(total_paise) FILTER(WHERE status NOT IN ('CANCELLED','REFUNDED')),0)::bigint gmv_paise,COALESCE(AVG(total_paise) FILTER(WHERE status='DELIVERED'),0)::bigint delivered_aov_paise FROM orders WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-($2::int-1)`,[vendorId,days]),
    query(`SELECT COUNT(DISTINCT customer_id)::int customers,COUNT(DISTINCT customer_id) FILTER(WHERE customer_id IN (SELECT customer_id FROM orders WHERE vendor_id=$1 AND status='DELIVERED' GROUP BY customer_id HAVING COUNT(*)>1))::int repeat_customers FROM orders WHERE vendor_id=$1 AND created_at>=CURRENT_DATE-($2::int-1)`,[vendorId,days]),
    query(`SELECT p.id,p.name,COALESCE(SUM(oi.quantity),0)::int units,COALESCE(SUM(oi.line_total_paise),0)::bigint revenue_paise FROM products p LEFT JOIN order_items oi ON oi.product_id=p.id LEFT JOIN orders o ON o.id=oi.order_id AND o.vendor_id=$1 AND o.status='DELIVERED' AND o.created_at>=CURRENT_DATE-($2::int-1) WHERE p.vendor_id=$1 GROUP BY p.id ORDER BY revenue_paise DESC LIMIT 20`,[vendorId,days])
  ]);
  res.json({windowDays:days,summary:summary.rows[0],customers:customers.rows[0],products:products.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/products', async (req,res,next)=>{try{
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`SELECT p.*,c.name AS category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.vendor_id=$1 ORDER BY p.created_at DESC`,[vendorId]);
  res.json({products:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/products', requirePermission('VIEW_OWN_SCOPE'), async (req,res,next)=>{try{
  const input=productSchema.parse(req.body);
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`INSERT INTO products(vendor_id,category_id,name,description,unit_label,price_paise,stock_qty,image_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[vendorId,input.categoryId??null,input.name,input.description??null,input.unitLabel,Math.round(input.priceRupees*100),input.stockQty,input.imageUrl??null]);
  const product=r.rows[0]; await audit('VENDOR_CREATE_PRODUCT','products',product.id,req.authUser!.id,{vendorId}); res.status(201).json({product});
}catch(e){next(e)}});

router.patch('/products/:id', requirePermission('VIEW_OWN_SCOPE'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const input=productSchema.partial().parse(req.body);
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const current=await query(`SELECT * FROM products WHERE id=$1 AND vendor_id=$2`,[id,vendorId]); if(!current.rows[0]){res.status(404).json({error:'PRODUCT_NOT_FOUND'});return;}
  const merged={...current.rows[0],...input}; const r=await query(`UPDATE products SET category_id=$1,name=$2,description=$3,unit_label=$4,price_paise=$5,stock_qty=$6,image_url=$7,is_active=$8,updated_at=NOW() WHERE id=$9 AND vendor_id=$10 RETURNING *`,[merged.categoryId??merged.category_id,merged.name,merged.description??null,merged.unitLabel??merged.unit_label,Math.round((input.priceRupees??Number(merged.price_paise)/100)*100),merged.stockQty??merged.stock_qty,merged.imageUrl??merged.image_url,input.isActive??merged.is_active,id,vendorId]);
  await audit('VENDOR_UPDATE_PRODUCT','products',id,req.authUser!.id,{vendorId}); res.json({product:r.rows[0]});
}catch(e){next(e)}});

router.get('/orders/:id/pickup-code', async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id);
  if(!process.env.DATABASE_URL){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const row=await query<{assignment_id:string;order_status:string}>(`SELECT da.id AS assignment_id,o.status::text AS order_status FROM delivery_assignments da JOIN orders o ON o.id=da.order_id WHERE da.order_id=$1 AND o.vendor_id=$2 LIMIT 1`,[id,vendorId]);
  if(!row.rows[0]){res.status(404).json({error:'DELIVERY_NOT_ASSIGNED'});return;}
  const code=await revealDeliveryOtp(row.rows[0].assignment_id,'PICKUP');
  if(!code){res.status(409).json({error:'PICKUP_CODE_NOT_READY'});return;}
  res.json({orderId:id,assignmentId:row.rows[0].assignment_id,pickupCode:code});
}catch(e){next(e)}});

router.get('/orders', async (req,res,next)=>{try{
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`SELECT id,status,total_paise,created_at FROM orders WHERE vendor_id=$1 ORDER BY created_at DESC LIMIT 100`,[vendorId]); res.json({orders:r.rows,mode:'database'});
}catch(e){next(e)}});

const transitions:Record<string,string[]>={PLACED:['VENDOR_ACCEPTED','CANCELLED'],PAID:['VENDOR_ACCEPTED','CANCELLED'],COD_CONFIRMED:['VENDOR_ACCEPTED','CANCELLED'],VENDOR_ACCEPTED:['PREPARING','CANCELLED'],PREPARING:['READY_FOR_PICKUP','CANCELLED']};
router.post('/orders/:id/status', requirePermission('MANAGE_OWN_ORDERS'), async (req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const status=z.string().parse(req.body.status);
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const current=await query<{status:string}>(`SELECT status::text FROM orders WHERE id=$1 AND vendor_id=$2`,[id,vendorId]); if(!current.rows[0]){res.status(404).json({error:'ORDER_NOT_FOUND'});return;}
  if(!(transitions[current.rows[0].status]??[]).includes(status)){res.status(409).json({error:'INVALID_TRANSITION',from:current.rows[0].status,to:status});return;}
  const timestamp = status==='VENDOR_ACCEPTED'?'vendor_accepted_at':status==='PREPARING'?'preparing_at':status==='READY_FOR_PICKUP'?'ready_for_pickup_at':null;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const r=await client.query(timestamp
      ? `UPDATE orders SET status=$1,${timestamp}=NOW(),updated_at=NOW() WHERE id=$2 AND vendor_id=$3 RETURNING id,status,updated_at`
      : `UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 AND vendor_id=$3 RETURNING id,status,updated_at`,[status,id,vendorId]);
    if(status==='CANCELLED') await releaseInventoryForOrder(client,id);
    await client.query('COMMIT');
    await recordOrderEvent({orderId:id,eventType:status,source:'VENDOR_APP',actorUserId:req.authUser!.id});
    if(status==='READY_FOR_PICKUP') { try { await assignNearestDeliveryPartner(id); } catch (e) { console.error('dispatch failed', e); } }
    await audit('VENDOR_ORDER_STATUS','orders',id,req.authUser!.id,{vendorId,status}); res.json({order:r.rows[0]});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{}); throw e; } finally { client.release(); }
}catch(e){next(e)}});

router.get('/subscription', async (req,res,next)=>{try{
  const vendorId=await resolveVendorId(req.authUser!.id); if(!vendorId){res.status(404).json({error:'VENDOR_NOT_FOUND'});return;}
  const r=await query(`SELECT vs.id,vs.status,vs.starts_at,vs.renews_at,vp.code,vp.name,vp.monthly_price_paise FROM vendor_subscriptions vs JOIN vendor_plans vp ON vp.id=vs.plan_id WHERE vs.vendor_id=$1 ORDER BY vs.created_at DESC LIMIT 1`,[vendorId]); res.json({subscription:r.rows[0]??null,mode:'database'});
}catch(e){next(e)}});

export default router;
