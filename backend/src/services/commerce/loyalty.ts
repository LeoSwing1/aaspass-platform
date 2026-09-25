import { query, pool } from '../../db/pool.js';
import { queueNotification } from '../notifications/service.js';

export async function runGrowthAutomation(): Promise<{loyaltyAwarded:number;referralsRewarded:number}> {
  let loyaltyAwarded=0, referralsRewarded=0;
  const orders=await query<{id:string;customer_id:string;total_paise:string}>(`SELECT id,customer_id,total_paise::text FROM orders WHERE status='DELIVERED' AND delivered_at IS NOT NULL AND delivered_at>=NOW()-INTERVAL '7 days' ORDER BY delivered_at ASC LIMIT 200`);
  for(const order of orders.rows){
    const points=Math.max(1,Math.floor(Number(order.total_paise)/1000));
    const key=`ORDER:${order.id}:LOYALTY`;
    const client=await pool.connect();
    try{await client.query('BEGIN');
      const account=await client.query<{id:string}>(`INSERT INTO loyalty_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id`,[order.customer_id]);
      const exists=await client.query(`SELECT id FROM loyalty_transactions WHERE idempotency_key=$1`,[key]);
      if(!exists.rows[0]){
        await client.query(`INSERT INTO loyalty_transactions(loyalty_account_id,direction,points,source_type,source_id,idempotency_key) VALUES($1,'EARN',$2,'ORDER', $3,$4)`,[account.rows[0].id,points,order.id,key]);
        await client.query(`UPDATE loyalty_accounts SET points=points+$1,lifetime_earned=lifetime_earned+$1,updated_at=NOW() WHERE id=$2`,[points,account.rows[0].id]);
        loyaltyAwarded++;
      }
      const referral=await client.query<{id:string;referrer_user_id:string}>(`SELECT id,referrer_user_id FROM referral_events WHERE referred_user_id=$1 AND status='PENDING' LIMIT 1`,[order.customer_id]);
      if(referral.rows[0]){
        const reward=100;
        const account2=await client.query<{id:string}>(`INSERT INTO loyalty_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id`,[referral.rows[0].referrer_user_id]);
        const key2=`REFERRAL:${referral.rows[0].id}`;
        const exists2=await client.query(`SELECT id FROM loyalty_transactions WHERE idempotency_key=$1`,[key2]);
        if(!exists2.rows[0]){await client.query(`INSERT INTO loyalty_transactions(loyalty_account_id,direction,points,source_type,source_id,idempotency_key) VALUES($1,'EARN',$2,'REFERRAL',$3,$4)`,[account2.rows[0].id,reward,referral.rows[0].id,key2]);await client.query(`UPDATE loyalty_accounts SET points=points+$1,lifetime_earned=lifetime_earned+$1,updated_at=NOW() WHERE id=$2`,[reward,account2.rows[0].id]);}
        await client.query(`UPDATE referral_events SET status='REWARDED',qualifying_order_id=$1,reward_points=$2,rewarded_at=NOW() WHERE id=$3`,[order.id,reward,referral.rows[0].id]);
        referralsRewarded++;
      }
      await client.query('COMMIT');
      if(!exists.rows[0]) await queueNotification({userId:order.customer_id,channel:'PUSH',title:'AasPass loyalty points added',body:`You earned ${points} AasPass points for your completed order.`,data:{type:'LOYALTY_EARNED',orderId:order.id,points}});
    }catch(e){await client.query('ROLLBACK');}finally{client.release();}
  }
  return {loyaltyAwarded,referralsRewarded};
}
