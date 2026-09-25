import { query } from '../../db/pool.js';
export async function postPlatformRevenue(orderId) {
    const existing = await query(`SELECT id FROM ledger_entries WHERE idempotency_key=$1 LIMIT 1`, [`ORDER:${orderId}:PLATFORM_FEE`]);
    if (!existing.rows[0]) {
        const order = await query('SELECT platform_fee_paise,platform_gst_paise FROM orders WHERE id=$1 LIMIT 1', [orderId]);
        const row = order.rows[0];
        if (!row)
            throw new Error('ORDER_NOT_FOUND');
        const platformAcct = await query("INSERT INTO ledger_accounts(code,owner_type,currency) VALUES('AASPASS_PLATFORM_REVENUE','PLATFORM','INR') ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id");
        await query(`INSERT INTO ledger_entries(order_id,account_id,entry_type,direction,amount_paise,reference_type,reference_id,idempotency_key) VALUES($1,$2,'PLATFORM_FEE','CREDIT',$3,'ORDER',$1,$4) ON CONFLICT DO NOTHING`, [orderId, platformAcct.rows[0].id, Number(row.platform_fee_paise), `ORDER:${orderId}:PLATFORM_FEE`]);
    }
    const gstExisting = await query(`SELECT id FROM ledger_entries WHERE idempotency_key=$1 LIMIT 1`, [`ORDER:${orderId}:PLATFORM_GST`]);
    if (!gstExisting.rows[0]) {
        const order = await query('SELECT platform_gst_paise FROM orders WHERE id=$1 LIMIT 1', [orderId]);
        const gstAcct = await query("INSERT INTO ledger_accounts(code,owner_type,currency) VALUES('AASPASS_GST_LIABILITY','TAX','INR') ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id");
        await query(`INSERT INTO ledger_entries(order_id,account_id,entry_type,direction,amount_paise,reference_type,reference_id,idempotency_key) VALUES($1,$2,'PLATFORM_GST','CREDIT',$3,'ORDER',$1,$4) ON CONFLICT DO NOTHING`, [orderId, gstAcct.rows[0].id, Number(order.rows[0]?.platform_gst_paise ?? 0), `ORDER:${orderId}:PLATFORM_GST`]);
    }
}
export async function postPlatformRevenueWithClient(client, orderId) {
    const order = await client.query('SELECT platform_fee_paise,platform_gst_paise FROM orders WHERE id=$1 LIMIT 1', [orderId]);
    const row = order.rows[0];
    if (!row)
        throw new Error('ORDER_NOT_FOUND');
    const platformAcct = await client.query("INSERT INTO ledger_accounts(code,owner_type,currency) VALUES('AASPASS_PLATFORM_REVENUE','PLATFORM','INR') ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id");
    await client.query(`INSERT INTO ledger_entries(order_id,account_id,entry_type,direction,amount_paise,reference_type,reference_id,idempotency_key)
     VALUES($1,$2,'PLATFORM_FEE','CREDIT',$3,'ORDER',$1,$4) ON CONFLICT DO NOTHING`, [orderId, platformAcct.rows[0].id, Number(row.platform_fee_paise), `ORDER:${orderId}:PLATFORM_FEE`]);
    if (Number(row.platform_gst_paise) > 0) {
        const gstAcct = await client.query("INSERT INTO ledger_accounts(code,owner_type,currency) VALUES('AASPASS_GST_LIABILITY','TAX','INR') ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id");
        await client.query(`INSERT INTO ledger_entries(order_id,account_id,entry_type,direction,amount_paise,reference_type,reference_id,idempotency_key)
       VALUES($1,$2,'PLATFORM_GST','CREDIT',$3,'ORDER',$1,$4) ON CONFLICT DO NOTHING`, [orderId, gstAcct.rows[0].id, Number(row.platform_gst_paise), `ORDER:${orderId}:PLATFORM_GST`]);
    }
}
