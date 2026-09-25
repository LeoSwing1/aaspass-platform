import type { PoolClient } from 'pg';

export async function debitWalletForOrder(client: PoolClient, userId: string, amountPaise: number, orderId: string): Promise<void> {
  if (amountPaise <= 0) return;
  const wallet = await client.query<{id:string;balance_paise:string;is_active:boolean}>(`SELECT id,balance_paise,is_active FROM wallet_accounts WHERE user_id=$1 FOR UPDATE`, [userId]);
  if (!wallet.rows[0] || !wallet.rows[0].is_active || Number(wallet.rows[0].balance_paise) < amountPaise) throw new Error('INSUFFICIENT_WALLET_BALANCE');
  const key = `ORDER:${orderId}:WALLET_DEBIT`;
  const existing = await client.query(`SELECT id FROM wallet_transactions WHERE idempotency_key=$1 LIMIT 1`, [key]);
  if (existing.rows[0]) return;
  await client.query(`INSERT INTO wallet_transactions(wallet_id,direction,amount_paise,transaction_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,'DEBIT',$2,'ORDER_PAYMENT','ORDER',$3,$4,'{}')`, [wallet.rows[0].id,amountPaise,orderId,key]);
  await client.query(`UPDATE wallet_accounts SET balance_paise=balance_paise-$1,updated_at=NOW() WHERE id=$2`, [amountPaise,wallet.rows[0].id]);
}

export async function creditWalletForRefund(client: PoolClient, userId: string, amountPaise: number, orderId: string): Promise<void> {
  if (amountPaise <= 0) return;
  const wallet = await client.query<{id:string}>(`INSERT INTO wallet_accounts(user_id) VALUES($1) ON CONFLICT(user_id) DO UPDATE SET updated_at=NOW() RETURNING id`, [userId]);
  const key = `ORDER:${orderId}:WALLET_REFUND`;
  const existing = await client.query(`SELECT id FROM wallet_transactions WHERE idempotency_key=$1 LIMIT 1`, [key]);
  if (existing.rows[0]) return;
  await client.query(`INSERT INTO wallet_transactions(wallet_id,direction,amount_paise,transaction_type,reference_type,reference_id,idempotency_key,metadata) VALUES($1,'CREDIT',$2,'ORDER_REFUND','ORDER',$3,$4,'{}')`, [wallet.rows[0].id,amountPaise,orderId,key]);
  await client.query(`UPDATE wallet_accounts SET balance_paise=balance_paise+$1,updated_at=NOW() WHERE id=$2`, [amountPaise,wallet.rows[0].id]);
}
