import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { query, pool } from '../db/pool.js';
import { audit } from '../services/audit.js';
import { queueNotification } from '../services/notifications/service.js';

const router = Router();
router.use(requireAuth, requireRoles('CUSTOMER','SUPER_ADMIN','ADMIN'));

const idSchema = z.string().uuid();
const listNameSchema = z.object({ name: z.string().trim().min(1).max(100) });
const listItemSchema = z.object({ productId: idSchema, quantity: z.coerce.number().int().min(1).max(99).default(1) });
const reviewSchema = z.object({ orderId: idSchema, productId: idSchema, rating: z.coerce.number().int().min(1).max(5), reviewText: z.string().trim().max(1000).optional().nullable() });
const redeemGiftCardSchema = z.object({ code: z.string().trim().min(8).max(80), idempotencyKey: z.string().trim().min(8).max(255) });

router.get('/wishlist', async (req,res,next)=>{ try {
  const r=await query(`SELECT w.id,w.product_id,p.name,p.description,p.unit_label,p.price_paise,p.image_url,p.stock_qty,p.is_active,
    v.id vendor_id,v.name vendor_name,v.is_open
    FROM customer_wishlists w JOIN products p ON p.id=w.product_id JOIN vendors v ON v.id=p.vendor_id
    WHERE w.user_id=$1 ORDER BY w.created_at DESC`,[req.authUser!.id]);
  res.json({items:r.rows,mode:'database'});
} catch(e){next(e);} });

router.post('/wishlist/:productId', async (req,res,next)=>{ try {
  const productId=idSchema.parse(req.params.productId);
  const r=await query(`INSERT INTO customer_wishlists(user_id,product_id) VALUES($1,$2) ON CONFLICT(user_id,product_id) DO NOTHING RETURNING id`,[req.authUser!.id,productId]);
  if(!r.rows[0]){res.json({saved:true,alreadySaved:true});return;}
  await audit('CUSTOMER_WISHLIST_ADDED','products',productId,req.authUser!.id,{});
  res.status(201).json({saved:true,id:r.rows[0].id});
} catch(e){next(e);} });

router.delete('/wishlist/:productId', async (req,res,next)=>{ try {
  const productId=idSchema.parse(req.params.productId);
  await query('DELETE FROM customer_wishlists WHERE user_id=$1 AND product_id=$2',[req.authUser!.id,productId]);
  await audit('CUSTOMER_WISHLIST_REMOVED','products',productId,req.authUser!.id,{});
  res.json({removed:true});
} catch(e){next(e);} });

router.get('/shopping-lists', async (req,res,next)=>{ try {
  const r=await query(`SELECT l.id,l.name,l.created_at,l.updated_at,
    COALESCE(json_agg(json_build_object('id',i.id,'productId',i.product_id,'quantity',i.quantity,'name',p.name,'pricePaise',p.price_paise,'imageUrl',p.image_url)) FILTER(WHERE i.id IS NOT NULL),'[]') items
    FROM shopping_lists l LEFT JOIN shopping_list_items i ON i.list_id=l.id LEFT JOIN products p ON p.id=i.product_id
    WHERE l.user_id=$1 GROUP BY l.id ORDER BY l.updated_at DESC`,[req.authUser!.id]);
  res.json({lists:r.rows,mode:'database'});
} catch(e){next(e);} });

router.post('/shopping-lists', async (req,res,next)=>{ try {
  const input=listNameSchema.parse(req.body);
  const r=await query(`INSERT INTO shopping_lists(user_id,name) VALUES($1,$2) RETURNING *`,[req.authUser!.id,input.name]);
  res.status(201).json({list:r.rows[0]});
} catch(e){next(e);} });

router.patch('/shopping-lists/:id', async (req,res,next)=>{ try {
  const id=idSchema.parse(req.params.id); const input=listNameSchema.parse(req.body);
  const r=await query(`UPDATE shopping_lists SET name=$1,updated_at=NOW() WHERE id=$2 AND user_id=$3 RETURNING *`,[input.name,id,req.authUser!.id]);
  if(!r.rows[0]){res.status(404).json({error:'SHOPPING_LIST_NOT_FOUND'});return;}
  res.json({list:r.rows[0]});
} catch(e){next(e);} });

router.delete('/shopping-lists/:id', async (req,res,next)=>{ try {
  const id=idSchema.parse(req.params.id);
  const r=await query('DELETE FROM shopping_lists WHERE id=$1 AND user_id=$2 RETURNING id',[id,req.authUser!.id]);
  if(!r.rows[0]){res.status(404).json({error:'SHOPPING_LIST_NOT_FOUND'});return;}
  res.json({deleted:true});
} catch(e){next(e);} });

router.post('/shopping-lists/:id/items', async (req,res,next)=>{ try {
  const listId=idSchema.parse(req.params.id); const input=listItemSchema.parse(req.body);
  const owns=await query('SELECT id FROM shopping_lists WHERE id=$1 AND user_id=$2 LIMIT 1',[listId,req.authUser!.id]);
  if(!owns.rows[0]){res.status(404).json({error:'SHOPPING_LIST_NOT_FOUND'});return;}
  const r=await query(`INSERT INTO shopping_list_items(list_id,product_id,quantity) VALUES($1,$2,$3)
    ON CONFLICT(list_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity RETURNING *`,[listId,input.productId,input.quantity]);
  await query('UPDATE shopping_lists SET updated_at=NOW() WHERE id=$1',[listId]);
  res.status(201).json({item:r.rows[0]});
} catch(e){next(e);} });

router.delete('/shopping-lists/:id/items/:productId', async (req,res,next)=>{ try {
  const listId=idSchema.parse(req.params.id); const productId=idSchema.parse(req.params.productId);
  const owns=await query('SELECT id FROM shopping_lists WHERE id=$1 AND user_id=$2 LIMIT 1',[listId,req.authUser!.id]);
  if(!owns.rows[0]){res.status(404).json({error:'SHOPPING_LIST_NOT_FOUND'});return;}
  await query('DELETE FROM shopping_list_items WHERE list_id=$1 AND product_id=$2',[listId,productId]);
  await query('UPDATE shopping_lists SET updated_at=NOW() WHERE id=$1',[listId]);
  res.json({removed:true});
} catch(e){next(e);} });

router.get('/reviews', async (req,res,next)=>{ try {
  const r=await query(`SELECT r.id,r.order_id,r.product_id,r.vendor_id,r.rating,r.review_text,r.created_at,r.updated_at,p.name product_name,p.image_url,v.name vendor_name
    FROM product_reviews r JOIN products p ON p.id=r.product_id JOIN vendors v ON v.id=r.vendor_id
    WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 200`,[req.authUser!.id]);
  const eligible=await query(`SELECT oi.order_id,oi.product_id,p.name product_name,v.name vendor_name
    FROM order_items oi JOIN orders o ON o.id=oi.order_id JOIN products p ON p.id=oi.product_id JOIN vendors v ON v.id=o.vendor_id
    LEFT JOIN product_reviews r ON r.order_id=oi.order_id AND r.product_id=oi.product_id AND r.user_id=$1
    WHERE o.customer_id=$1 AND o.status='DELIVERED' AND r.id IS NULL ORDER BY o.created_at DESC LIMIT 100`,[req.authUser!.id]);
  res.json({reviews:r.rows,eligible:eligible.rows,mode:'database'});
} catch(e){next(e);} });

router.post('/reviews', async (req,res,next)=>{ const client=await pool.connect(); try {
  const input=reviewSchema.parse(req.body); const userId=req.authUser!.id;
  await client.query('BEGIN');
  const eligible=await client.query<{vendor_id:string}>(`SELECT o.vendor_id FROM orders o JOIN order_items oi ON oi.order_id=o.id AND oi.product_id=$2
    WHERE o.id=$1 AND o.customer_id=$3 AND o.status='DELIVERED' LIMIT 1`,[input.orderId,input.productId,userId]);
  if(!eligible.rows[0]){await client.query('ROLLBACK');res.status(409).json({error:'REVIEW_NOT_ELIGIBLE'});return;}
  const r=await client.query(`INSERT INTO product_reviews(user_id,order_id,product_id,vendor_id,rating,review_text) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(user_id,order_id,product_id) DO UPDATE SET rating=EXCLUDED.rating,review_text=EXCLUDED.review_text,updated_at=NOW() RETURNING *`,[userId,input.orderId,input.productId,eligible.rows[0].vendor_id,input.rating,input.reviewText??null]);
  await client.query(`UPDATE vendors v SET rating=COALESCE(stats.avg_rating,0),review_count=COALESCE(stats.review_count,0),updated_at=NOW()
    FROM (SELECT vendor_id,ROUND(AVG(rating)::numeric,1) avg_rating,COUNT(*)::int review_count FROM product_reviews WHERE vendor_id=$1 GROUP BY vendor_id) stats
    WHERE v.id=stats.vendor_id`,[eligible.rows[0].vendor_id]);
  await client.query('COMMIT');
  await audit('CUSTOMER_PRODUCT_REVIEW_SAVED','product_reviews',r.rows[0]?.id??null,userId,{orderId:input.orderId,productId:input.productId,rating:input.rating});
  res.status(201).json({review:r.rows[0]});
} catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });


router.get('/security/sessions', async (req,res,next)=>{ try {
  const r=await query(`SELECT id,jti,created_at,last_seen_at,expires_at,ip_address::text ip_address,user_agent,CASE WHEN jti=$2 THEN true ELSE false END current
    FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>NOW() ORDER BY last_seen_at DESC NULLS LAST,created_at DESC`,[req.authUser!.id,req.authTokenJti]);
  res.json({sessions:r.rows.map(({jti,...x})=>x),mode:'database'});
} catch(e){next(e);} });

router.post('/security/revoke-other-sessions', async (req,res,next)=>{ try {
  const r=await query(`UPDATE auth_sessions SET revoked_at=NOW(),revoke_reason='USER_REVOKED_OTHER_SESSIONS'
    WHERE user_id=$1 AND revoked_at IS NULL AND jti<>$2 RETURNING id`,[req.authUser!.id,req.authTokenJti]);
  await audit('CUSTOMER_OTHER_SESSIONS_REVOKED','auth_sessions',req.authUser!.id,req.authUser!.id,{count:r.rowCount??0});
  res.json({revokedCount:r.rowCount??0});
} catch(e){next(e);} });

router.get('/saved-payments', async (req,res,next)=>{ try {
  const r=await query(`SELECT id,provider,brand,last4,expiry_month,expiry_year,is_default,created_at,updated_at
    FROM saved_payment_methods WHERE user_id=$1 ORDER BY is_default DESC,updated_at DESC`,[req.authUser!.id]);
  res.json({methods:r.rows,mode:'database',writePath:'provider_only'});
} catch(e){next(e);} });

router.get('/gift-cards', async (req,res,next)=>{ try {
  const r=await query(`SELECT id,code_last4,initial_balance_paise,balance_paise,currency,status,expires_at,created_at,updated_at
    FROM gift_cards WHERE issued_to_user_id=$1 ORDER BY created_at DESC`,[req.authUser!.id]);
  const tx=await query(`SELECT t.id,t.gift_card_id,t.direction,t.amount_paise,t.reference_type,t.reference_id,t.created_at
    FROM gift_card_transactions t JOIN gift_cards g ON g.id=t.gift_card_id WHERE g.issued_to_user_id=$1 ORDER BY t.created_at DESC LIMIT 100`,[req.authUser!.id]);
  res.json({cards:r.rows,transactions:tx.rows,mode:'database'});
} catch(e){next(e);} });

router.post('/gift-cards/redeem', async (req,res,next)=>{ const client=await pool.connect(); try {
  const input=redeemGiftCardSchema.parse(req.body); const userId=req.authUser!.id; const codeHash=crypto.createHash('sha256').update(input.code.toUpperCase()).digest('hex');
  await client.query('BEGIN');
  const duplicate=await client.query('SELECT id FROM gift_card_transactions WHERE idempotency_key=$1 LIMIT 1',[input.idempotencyKey]);
  if(duplicate.rows[0]){await client.query('COMMIT');res.json({redeemed:true,idempotent:true});return;}
  const card=await client.query<{id:string;balance_paise:string;status:string;expires_at:string|null}>(`SELECT id,balance_paise,status,expires_at FROM gift_cards WHERE code_hash=$1 FOR UPDATE`,[codeHash]);
  const row=card.rows[0];
  if(!row){await client.query('ROLLBACK');res.status(404).json({error:'GIFT_CARD_NOT_FOUND'});return;}
  if(row.status!=='ACTIVE'){await client.query('ROLLBACK');res.status(409).json({error:'GIFT_CARD_NOT_ACTIVE'});return;}
  if(row.expires_at && new Date(row.expires_at).getTime()<=Date.now()){await client.query(`UPDATE gift_cards SET status='EXPIRED',updated_at=NOW() WHERE id=$1`,[row.id]);await client.query('COMMIT');res.status(409).json({error:'GIFT_CARD_EXPIRED'});return;}
  const amount=Number(row.balance_paise); if(amount<=0){await client.query(`UPDATE gift_cards SET status='REDEEMED',updated_at=NOW() WHERE id=$1`,[row.id]);await client.query('COMMIT');res.status(409).json({error:'GIFT_CARD_EMPTY'});return;}
  const wallet=await client.query<{id:string}>(`INSERT INTO wallet_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id`,[userId]);
  await client.query(`INSERT INTO wallet_transactions(wallet_id,direction,amount_paise,transaction_type,reference_type,reference_id,idempotency_key,metadata)
    VALUES($1,'CREDIT',$2,'GIFT_CARD_REDEEM','GIFT_CARD',$3,$4,$5)`,[wallet.rows[0].id,amount,row.id,input.idempotencyKey,JSON.stringify({giftCardId:row.id})]);
  await client.query('UPDATE wallet_accounts SET balance_paise=balance_paise+$1,updated_at=NOW() WHERE id=$2',[amount,wallet.rows[0].id]);
  await client.query(`INSERT INTO gift_card_transactions(gift_card_id,user_id,direction,amount_paise,reference_type,reference_id,idempotency_key) VALUES($1,$2,'DEBIT',$3,'WALLET_REDEEM',$1,$4)`,[row.id,userId,amount,input.idempotencyKey]);
  await client.query(`UPDATE gift_cards SET balance_paise=0,status='REDEEMED',updated_at=NOW() WHERE id=$1`,[row.id]);
  await client.query('COMMIT');
  await audit('CUSTOMER_GIFT_CARD_REDEEMED','gift_cards',row.id,userId,{amountPaise:amount});
  await queueNotification({userId,channel:'PUSH',title:'Gift card added to your AasPass Wallet',body:`₹${(amount/100).toFixed(2)} has been added from your gift card.`,data:{type:'GIFT_CARD_REDEEMED',giftCardId:row.id}});
  res.json({redeemed:true,amountPaise:amount});
} catch(e){await client.query('ROLLBACK');next(e);} finally{client.release();} });

export default router;
