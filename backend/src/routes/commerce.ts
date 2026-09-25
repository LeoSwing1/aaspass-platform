import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { query, pool } from '../db/pool.js';

const router=Router();
router.use(requireAuth,requireRoles('CUSTOMER','SUPER_ADMIN','ADMIN'));

router.get('/wallet', async(req,res,next)=>{try{
  await query(`INSERT INTO wallet_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING`,[req.authUser!.id]);
  const wallet=await query(`SELECT id,balance_paise,currency,is_active,created_at,updated_at FROM wallet_accounts WHERE user_id=$1`,[req.authUser!.id]);
  const tx=await query(`SELECT id,direction,amount_paise,transaction_type,reference_type,reference_id,metadata,created_at FROM wallet_transactions WHERE wallet_id=$1 ORDER BY created_at DESC LIMIT 50`,[wallet.rows[0].id]);
  res.json({wallet:wallet.rows[0],transactions:tx.rows,mode:'database'});
}catch(e){next(e)}});

router.get('/promotions', async(req,res,next)=>{try{
  const r=await query(`SELECT p.id,p.code,p.title,p.description,p.discount_type,p.discount_value,p.max_discount_paise,p.min_order_paise,p.starts_at,p.ends_at FROM promotions p WHERE p.is_active=true AND p.starts_at<=NOW() AND (p.ends_at IS NULL OR p.ends_at>NOW()) AND (p.usage_limit IS NULL OR (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id=p.id)<p.usage_limit) AND (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id=p.id AND pr.user_id=$1)<p.per_customer_limit ORDER BY p.created_at DESC`,[req.authUser!.id]);res.json({promotions:r.rows,mode:'database'});
}catch(e){next(e)}});

router.post('/promotions/validate', async(req,res,next)=>{try{
  const input=z.object({code:z.string().trim().toUpperCase(),orderSubtotalPaise:z.number().int().nonnegative()}).parse(req.body);
  const r=await query<any>(`SELECT p.*, (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id=p.id) total_redemptions, (SELECT COUNT(*) FROM promotion_redemptions pr WHERE pr.promotion_id=p.id AND pr.user_id=$1) customer_redemptions FROM promotions p WHERE p.code=$2 LIMIT 1`,[req.authUser!.id,input.code]);
  const p=r.rows[0]; if(!p){res.status(404).json({error:'PROMOTION_NOT_FOUND'});return;}
  if(!p.is_active||new Date(p.starts_at)>new Date()||(p.ends_at&&new Date(p.ends_at)<=new Date())){res.status(409).json({error:'PROMOTION_INACTIVE'});return;}
  if(p.usage_limit!=null&&Number(p.total_redemptions)>=Number(p.usage_limit)){res.status(409).json({error:'PROMOTION_EXHAUSTED'});return;}
  if(Number(p.customer_redemptions)>=Number(p.per_customer_limit)){res.status(409).json({error:'PROMOTION_CUSTOMER_LIMIT'});return;}
  if(input.orderSubtotalPaise<Number(p.min_order_paise)){res.status(409).json({error:'PROMOTION_MIN_ORDER',minimumPaise:Number(p.min_order_paise)});return;}
  const discount=p.discount_type==='PERCENT'?Math.min(Number(p.max_discount_paise??Number.MAX_SAFE_INTEGER),Math.floor(input.orderSubtotalPaise*Number(p.discount_value)/100)):Math.min(input.orderSubtotalPaise,Number(p.discount_value));
  res.json({valid:true,code:p.code,title:p.title,discountPaise:discount,mode:'database'});
}catch(e){next(e)}});

router.post('/wallet/admin-credit', async(req,res,next)=>{try{
  if(!['SUPER_ADMIN','ADMIN'].includes(req.authUser!.role)){res.status(403).json({error:'FORBIDDEN'});return;}
  const input=z.object({customerId:z.string().min(5),amountPaise:z.number().int().positive(),reason:z.string().trim().min(2).max(500),idempotencyKey:z.string().min(8).max(255)}).parse(req.body);
  const client=await pool.connect();
  try{await client.query('BEGIN');const user=await client.query<{id:string}>(`SELECT user_id id FROM customer_profiles WHERE customer_code=$1 LIMIT 1`,[input.customerId]);if(!user.rows[0]){await client.query('ROLLBACK');res.status(404).json({error:'CUSTOMER_NOT_FOUND'});return;}const wallet=await client.query<{id:string}>(`INSERT INTO wallet_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id`,[user.rows[0].id]);const existing=await client.query(`SELECT id FROM wallet_transactions WHERE idempotency_key=$1`,[input.idempotencyKey]);if(existing.rows[0]){await client.query('COMMIT');res.json({ok:true,reused:true,transactionId:existing.rows[0].id});return;}const tx=await client.query(`INSERT INTO wallet_transactions(wallet_id,direction,amount_paise,transaction_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,'CREDIT',$2,'ADMIN_CREDIT','CUSTOMER',$3,$4,$5) RETURNING id`,[wallet.rows[0].id,input.amountPaise,input.customerId,input.idempotencyKey,JSON.stringify({reason:input.reason,actor:req.authUser!.id})]);await client.query(`UPDATE wallet_accounts SET balance_paise=balance_paise+$1,updated_at=NOW() WHERE id=$2`,[input.amountPaise,wallet.rows[0].id]);await client.query('COMMIT');res.status(201).json({ok:true,transactionId:tx.rows[0].id});}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}catch(e){next(e)}});
export default router;
