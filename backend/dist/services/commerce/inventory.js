export async function releaseInventoryForOrder(client, orderId) {
    const rows = await client.query(`SELECT product_id,quantity FROM inventory_reservations WHERE order_id=$1 AND status='HELD' FOR UPDATE`, [orderId]);
    for (const row of rows.rows) {
        await client.query(`UPDATE products SET stock_qty=stock_qty+$1,reserved_qty=GREATEST(0,reserved_qty-$1),updated_at=NOW() WHERE id=$2`, [row.quantity, row.product_id]);
        await client.query(`UPDATE inventory_reservations SET status='RELEASED',released_at=NOW() WHERE order_id=$1 AND product_id=$2 AND status='HELD'`, [orderId, row.product_id]);
    }
    return rows.rows.length;
}
export async function commitInventoryForOrder(client, orderId) {
    const rows = await client.query(`SELECT product_id,quantity FROM inventory_reservations WHERE order_id=$1 AND status='HELD' FOR UPDATE`, [orderId]);
    for (const row of rows.rows) {
        await client.query(`UPDATE products SET reserved_qty=GREATEST(0,reserved_qty-$1),updated_at=NOW() WHERE id=$2`, [row.quantity, row.product_id]);
        await client.query(`UPDATE inventory_reservations SET status='COMMITTED',committed_at=NOW() WHERE order_id=$1 AND product_id=$2 AND status='HELD'`, [orderId, row.product_id]);
    }
    return rows.rows.length;
}
