import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query } from '../../db/pool.js';
function hashOtp(assignmentId, otp) {
    return crypto.createHash('sha256').update(`${assignmentId}:${otp}`).digest('hex');
}
function encryptionKey() {
    return crypto.createHash('sha256').update(env.DELIVERY_OTP_SECRET).digest();
}
function encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { ciphertext: ciphertext.toString('base64url'), iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}
function decrypt(ciphertext, iv, tag) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
export function generateDeliveryOtp() { return String(crypto.randomInt(100000, 1000000)); }
export async function setDeliveryOtps(assignmentId) {
    const pickupOtp = generateDeliveryOtp();
    const dropOtp = generateDeliveryOtp();
    const pickup = encrypt(pickupOtp);
    const drop = encrypt(dropOtp);
    await query(`UPDATE delivery_assignments SET pickup_otp_hash=$1,drop_otp_hash=$2,pickup_otp_ciphertext=$3,pickup_otp_iv=$4,pickup_otp_tag=$5,drop_otp_ciphertext=$6,drop_otp_iv=$7,drop_otp_tag=$8,pickup_otp_attempts=0,drop_otp_attempts=0,updated_at=NOW() WHERE id=$9`, [hashOtp(assignmentId, pickupOtp), hashOtp(assignmentId, dropOtp), pickup.ciphertext, pickup.iv, pickup.tag, drop.ciphertext, drop.iv, drop.tag, assignmentId]);
    return { pickupOtp, dropOtp };
}
export async function revealDeliveryOtp(assignmentId, stage) {
    const row = await query(`SELECT pickup_otp_ciphertext,pickup_otp_iv,pickup_otp_tag,drop_otp_ciphertext,drop_otp_iv,drop_otp_tag FROM delivery_assignments WHERE id=$1 LIMIT 1`, [assignmentId]);
    const data = row.rows[0];
    if (!data)
        return null;
    const c = stage === 'PICKUP' ? data.pickup_otp_ciphertext : data.drop_otp_ciphertext;
    const iv = stage === 'PICKUP' ? data.pickup_otp_iv : data.drop_otp_iv;
    const tag = stage === 'PICKUP' ? data.pickup_otp_tag : data.drop_otp_tag;
    if (!c || !iv || !tag)
        return null;
    return decrypt(c, iv, tag);
}
export async function verifyDeliveryOtp(assignmentId, stage, otp) {
    const row = await query(`SELECT id,pickup_otp_hash,drop_otp_hash,pickup_otp_attempts,drop_otp_attempts FROM delivery_assignments WHERE id=$1 LIMIT 1`, [assignmentId]);
    const data = row.rows[0];
    if (!data)
        return false;
    const attempts = stage === 'PICKUP' ? data.pickup_otp_attempts : data.drop_otp_attempts;
    if (attempts >= 5)
        return false;
    const hash = hashOtp(assignmentId, otp);
    const expected = stage === 'PICKUP' ? data.pickup_otp_hash : data.drop_otp_hash;
    if (stage === 'PICKUP')
        await query(`UPDATE delivery_assignments SET pickup_otp_attempts=pickup_otp_attempts+1 WHERE id=$1`, [assignmentId]);
    else
        await query(`UPDATE delivery_assignments SET drop_otp_attempts=drop_otp_attempts+1 WHERE id=$1`, [assignmentId]);
    return Boolean(expected && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash)));
}
