import { env } from '../../config/env.js';
import { query, pool } from '../../db/pool.js';
import { creditWalletForRefund } from '../commerce/wallet.js';
import { recordOrderEvent } from '../orders/events.js';

function baseUrl(){return env.CASHFREE_MODE==='production'?'https://api.cashfree.com/pg':'https://sandbox.cashfree.com/pg';}
function configured(){return Boolean(env.CASHFREE_CLIENT_ID&&env.CASHFREE_CLIENT_SECRET);}

export async function createProviderRefund(input:{orderId:string;amountPaise:number;refundId:string;note:string;speed:'STANDARD'|'INSTANT'}):Promise<any>{
  if(!configured()) throw new Error('CASHFREE_NOT_CONFIGURED');
  const response=await fetch(`${baseUrl()}/orders/${encodeURIComponent(input.orderId)}/refunds`,{
    method:'POST',headers:{'content-type':'application/json','accept':'application/json','x-api-version':env.CASHFREE_API_VERSION,'x-client-id':env.CASHFREE_CLIENT_ID!,'x-client-secret':env.CASHFREE_CLIENT_SECRET!,'x-request-id':`aaspass-refund-${input.refundId}`,'x-idempotency-key':input.refundId},
    body:JSON.stringify({refund_amount:Number((input.amountPaise/100).toFixed(2)),refund_id:input.refundId,refund_note:input.note,refund_speed:input.speed})
  });
  const raw=await response.json();
  if(!response.ok) throw new Error(`CASHFREE_REFUND_FAILED:${response.status}:${JSON.stringify(raw)}`);
  return raw;
}

export async function requestRefund(input:{orderId:string;amountPaise:number;reason:string;createdBy:string;speed:'STANDARD'|'INSTANT'}):Promise<{id:string;status:string;providerRef?:string|null;walletRefundPaise:number;providerRefundPaise:number}> {
  const order=await query<{total_paise:string;status:string;customer_id:string;wallet_applied_paise:string;wallet_refund_paise:string;cashfree_refund_paise:string}>(`SELECT total_paise,status::text,customer_id,wallet_applied_paise,wallet_refund_paise,cashfree_refund_paise FROM orders WHERE id=$1 LIMIT 1`,[input.orderId]);
  const row=order.rows[0];
  if(!row) throw new Error('ORDER_NOT_FOUND');
  if(!['PAID','DELIVERED','CANCELLED','REFUND_PENDING','REFUNDED'].includes(row.status)) throw new Error('ORDER_NOT_REFUNDABLE');
  if(input.amountPaise<=0 || input.amountPaise>Number(row.total_paise)) throw new Error('INVALID_REFUND_AMOUNT');
  const walletAvailable=Math.max(0,Number(row.wallet_applied_paise||0)-Number(row.wallet_refund_paise||0));
  const walletRefund=Math.min(walletAvailable,input.amountPaise);
  const providerRefund=input.amountPaise-walletRefund;
  if(providerRefund>0){
    const providerCap=Number(row.cashfree_refund_paise||0) || Math.max(0,Number(row.total_paise)-Number(row.wallet_applied_paise||0));
    if(providerRefund>providerCap) throw new Error('INVALID_PROVIDER_REFUND_AMOUNT');
  }
  const existing=await query<{id:string;status:string;provider_ref:string|null}>(`SELECT id,status,provider_ref FROM refunds WHERE order_id=$1 AND status IN ('PENDING','PROCESSING') LIMIT 1`,[input.orderId]);
  if(existing.rows[0]) return {...existing.rows[0],walletRefundPaise:0,providerRefundPaise:Number(row.cashfree_refund_paise||0)};

  const client=await pool.connect();
  let refundId:string|null=null;
  try{
    await client.query('BEGIN');
    if(walletRefund>0) await creditWalletForRefund(client,row.customer_id,walletRefund,input.orderId);
    await client.query(`UPDATE orders SET status='REFUND_PENDING',wallet_refund_paise=wallet_refund_paise+$1,cashfree_refund_paise=CASE WHEN $2>0 THEN $2 ELSE cashfree_refund_paise END,updated_at=NOW() WHERE id=$3`,[walletRefund,providerRefund,input.orderId]);
    if(providerRefund>0){
      refundId=`AASRF-${input.orderId.replaceAll('-','').slice(0,18)}-${Date.now().toString(36)}`.slice(0,40);
      await client.query(`INSERT INTO refunds(order_id,amount_paise,status,provider,provider_ref,reason,created_by) VALUES($1,$2,'PENDING','CASHFREE',$3,$4,$5)`,[input.orderId,providerRefund,refundId,input.reason,input.createdBy]);
    }
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}

  if(providerRefund===0){
    await query(`UPDATE payments SET status='REFUNDED',updated_at=NOW() WHERE order_id=$1 AND status IN ('PAID','PARTIALLY_REFUNDED')`,[input.orderId]);
    await query(`UPDATE orders SET status='REFUNDED',updated_at=NOW() WHERE id=$1`,[input.orderId]);
    await recordOrderEvent({orderId:input.orderId,eventType:'REFUNDED',source:'AASPASS_WALLET_REFUND',payload:{walletRefundPaise:walletRefund},notify:true});
    return {id:`wallet-${input.orderId}`,status:'PROCESSED',walletRefundPaise:walletRefund,providerRefundPaise:0};
  }

  try {
    const raw=await createProviderRefund({orderId:input.orderId,amountPaise:providerRefund,refundId:refundId!,note:input.reason,speed:input.speed});
    const providerStatus=String(raw.refund_status??raw.status??'PENDING').toUpperCase();
    const internal=providerStatus==='SUCCESS'?'PROCESSED':'PROCESSING';
    await query(`UPDATE refunds SET status=$1,provider_ref=$2,processed_at=CASE WHEN $1='PROCESSED' THEN NOW() ELSE processed_at END,updated_at=NOW() WHERE id=$3`,[internal,String(raw.cf_refund_id??raw.refund_id??refundId),refundId]);
    if(internal==='PROCESSED') await finalizeRefund(input.orderId,refundId!);
    return {id:refundId!,status:internal,providerRef:String(raw.cf_refund_id??raw.refund_id??refundId),walletRefundPaise:walletRefund,providerRefundPaise:providerRefund};
  } catch(error) {
    await query(`UPDATE refunds SET status='PENDING',updated_at=NOW() WHERE id=$1`,[refundId]);
    throw error;
  }
}

export async function finalizeRefund(orderId:string,refundId:string):Promise<void>{
  await query(`UPDATE refunds SET status='PROCESSED',processed_at=COALESCE(processed_at,NOW()),updated_at=NOW() WHERE id=$1`,[refundId]);
  await query(`UPDATE payments SET status='REFUNDED',updated_at=NOW() WHERE order_id=$1 AND status IN ('PAID','PARTIALLY_REFUNDED')`,[orderId]);
  await query(`UPDATE orders SET status='REFUNDED',updated_at=NOW() WHERE id=$1`,[orderId]);
  await recordOrderEvent({orderId,eventType:'REFUNDED',source:'CASHFREE_REFUND',payload:{refundId},notify:true});
}


export async function syncProviderRefund(refundId:string):Promise<{status:string;providerStatus:string}> {
  const row=await query<{id:string;order_id:string;provider_ref:string|null;status:string}>(`SELECT id,order_id,provider_ref,status FROM refunds WHERE id=$1 LIMIT 1`,[refundId]);
  const refund=row.rows[0];
  if(!refund) throw new Error('REFUND_NOT_FOUND');
  if(!refund.provider_ref) throw new Error('REFUND_PROVIDER_REFERENCE_MISSING');
  if(!configured()) throw new Error('CASHFREE_NOT_CONFIGURED');
  const response=await fetch(`${baseUrl()}/orders/${encodeURIComponent(refund.order_id)}/refunds/${encodeURIComponent(refund.provider_ref)}`,{
    headers:{'accept':'application/json','x-api-version':env.CASHFREE_API_VERSION,'x-client-id':env.CASHFREE_CLIENT_ID!,'x-client-secret':env.CASHFREE_CLIENT_SECRET!,'x-request-id':`aaspass-refund-sync-${refund.id}`}
  });
  const raw=await response.json();
  if(!response.ok) throw new Error(`CASHFREE_REFUND_STATUS_FAILED:${response.status}:${JSON.stringify(raw)}`);
  const providerStatus=String(raw.refund_status??raw.status??'PENDING').toUpperCase();
  const internal=providerStatus==='SUCCESS'?'PROCESSED':providerStatus==='FAILED'?'FAILED':providerStatus==='CANCELLED'?'CANCELLED':'PROCESSING';
  await query(`UPDATE refunds SET status=$1,processed_at=CASE WHEN $1 IN ('PROCESSED','FAILED','CANCELLED') THEN COALESCE(processed_at,NOW()) ELSE processed_at END,updated_at=NOW() WHERE id=$2`,[internal,refund.id]);
  if(internal==='PROCESSED') await finalizeRefund(refund.order_id,refund.id);
  return {status:internal,providerStatus};
}
