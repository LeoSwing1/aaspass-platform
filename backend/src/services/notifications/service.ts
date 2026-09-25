import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { query, pool } from '../../db/pool.js';

function base64url(value: string): string { return Buffer.from(value).toString('base64url'); }

function createFcmAssertion(): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: env.FCM_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const privateKey = env.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  return `${unsigned}.${signer.sign(privateKey, 'base64url')}`;
}

let cachedFcmToken: { value: string; expiresAt: number } | null = null;

async function getFcmAccessToken(): Promise<string> {
  if (cachedFcmToken && cachedFcmToken.expiresAt > Date.now() + 60_000) return cachedFcmToken.value;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createFcmAssertion(),
    }).toString(),
  });
  const raw = await response.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!response.ok || !raw.access_token) throw new Error(`FCM_AUTH_FAILED:${response.status}:${raw.error ?? 'unknown'}`);
  cachedFcmToken = { value: raw.access_token, expiresAt: Date.now() + Math.max(60, raw.expires_in ?? 3600) * 1000 };
  return raw.access_token;
}

export function fcmConfigured(): boolean { return Boolean(env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY); }
export function whatsappConfigured(): boolean { return Boolean(env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN); }

export async function sendFcm(token: string, title: string, body: string, data: Record<string, string> = {}): Promise<{ messageId: string }> {
  if (!fcmConfigured()) throw new Error('FCM_NOT_CONFIGURED');
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID!)}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${await getFcmAccessToken()}`, 'content-type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ message: { token, notification: { title, body }, data } }),
  });
  const raw = await response.json() as { name?: string; error?: { message?: string } };
  if (!response.ok || !raw.name) throw new Error(`FCM_SEND_FAILED:${response.status}:${raw.error?.message ?? 'unknown'}`);
  return { messageId: raw.name };
}

export async function sendWhatsAppText(phone: string, body: string): Promise<{ messageId: string }> {
  if (!whatsappConfigured()) throw new Error('WHATSAPP_NOT_CONFIGURED');
  const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID!)}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: phone.replace(/\D/g, ''), type: 'text', text: { body } }),
  });
  const raw = await response.json() as { messages?: Array<{ id?: string }>; error?: { message?: string } };
  if (!response.ok || !raw.messages?.[0]?.id) throw new Error(`WHATSAPP_SEND_FAILED:${response.status}:${raw.error?.message ?? 'unknown'}`);
  return { messageId: raw.messages[0].id };
}

async function preferenceAllows(userId: string, channel: string): Promise<boolean> {
  const result = await query<{ push_enabled:boolean; whatsapp_enabled:boolean; sms_enabled:boolean; email_enabled:boolean }>(
    'SELECT push_enabled,whatsapp_enabled,sms_enabled,email_enabled FROM customer_notification_preferences WHERE user_id=$1',[userId]);
  const prefs=result.rows[0];
  if (!prefs) return true;
  if (channel==='PUSH') return prefs.push_enabled;
  if (channel==='WHATSAPP') return prefs.whatsapp_enabled;
  if (channel==='SMS') return prefs.sms_enabled;
  if (channel==='EMAIL') return prefs.email_enabled;
  return true;
}

export async function queueNotification(input: {
  userId: string;
  channel: 'PUSH' | 'WHATSAPP' | 'SMS' | 'EMAIL';
  title: string;
  body: string;
  data?: Record<string, string>;
  dispatchNow?: boolean;
}): Promise<string | null> {
  if (!(await preferenceAllows(input.userId, input.channel))) return null;
  const result = await query<{ id: string }>(`INSERT INTO notifications(user_id,channel,title,body,data,status) VALUES($1,$2,$3,$4,$5,'PENDING') RETURNING id`, [input.userId,input.channel,input.title,input.body,JSON.stringify(input.data??{})]);
  const id=result.rows[0]?.id;
  if(id && input.dispatchNow!==false && env.NOTIFICATION_DISPATCH_ENABLED) void dispatchNotification(id);
  return id??null;
}

export async function dispatchNotification(notificationId: string): Promise<void> {
  const result = await query<any>(`SELECT n.*,u.phone FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.id=$1 LIMIT 1`, [notificationId]);
  const item=result.rows[0]; if(!item) return;
  const attempt=await query<{n:number}>(`SELECT COALESCE(MAX(attempt_number),0)::int+1 AS n FROM notification_delivery_attempts WHERE notification_id=$1`,[notificationId]);
  const attemptNumber=attempt.rows[0]?.n??1;
  try {
    if(item.channel==='PUSH'){
      const tokens=await query<{id:string;token:string}>(`SELECT id,token FROM device_tokens WHERE user_id=$1 AND is_active=true`,[item.user_id]);
      if(!fcmConfigured()){
        await query(`UPDATE notifications SET status='QUEUED' WHERE id=$1`,[notificationId]);
        await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,attempt_number,error_message) VALUES($1,'FCM','QUEUED',$2,'FCM credentials not configured')`,[notificationId,attemptNumber]); return;
      }
      if(tokens.rows.length===0){
        await query(`UPDATE notifications SET status='SKIPPED' WHERE id=$1`,[notificationId]);
        await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,attempt_number,error_message) VALUES($1,'FCM','SKIPPED',$2,'No active device token')`,[notificationId,attemptNumber]); return;
      }
      let delivered=0;
      for(const token of tokens.rows){
        try{
          const sent=await sendFcm(token.token,item.title,item.body,item.data??{});
          await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,provider_message_id,attempt_number) VALUES($1,'FCM','SENT',$2,$3)`,[notificationId,sent.messageId,attemptNumber]); delivered++;
        }catch(error){
          const message=error instanceof Error?error.message:'Unknown FCM error';
          await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,attempt_number,error_message) VALUES($1,'FCM','FAILED',$2,$3)`,[notificationId,attemptNumber,message]);
          if(/registration token is not registered|unregistered|not found/i.test(message)) await query(`UPDATE device_tokens SET is_active=false,updated_at=NOW() WHERE id=$1`,[token.id]);
        }
      }
      await query(`UPDATE notifications SET status=$2,sent_at=CASE WHEN $2='SENT' THEN NOW() ELSE sent_at END WHERE id=$1`,[notificationId,delivered>0?'SENT':'FAILED']);
      return;
    }
    if(item.channel==='WHATSAPP'){
      const sent=await sendWhatsAppText(item.phone,item.body);
      await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,provider_message_id,attempt_number) VALUES($1,'WHATSAPP','SENT',$2,$3)`,[notificationId,sent.messageId,attemptNumber]);
      await query(`UPDATE notifications SET status='SENT',sent_at=NOW() WHERE id=$1`,[notificationId]); return;
    }
    await query(`UPDATE notifications SET status='QUEUED' WHERE id=$1`,[notificationId]);
    await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,attempt_number,error_message) VALUES($1,$2,'QUEUED',$3,$4)`,[notificationId,item.channel,attemptNumber,`${item.channel} provider adapter not configured`]);
  } catch(error){
    const message=error instanceof Error?error.message:'Unknown notification error';
    await query(`UPDATE notifications SET status='FAILED' WHERE id=$1`,[notificationId]);
    await query(`INSERT INTO notification_delivery_attempts(notification_id,provider,status,attempt_number,error_message) VALUES($1,$2,'FAILED',$3,$4)`,[notificationId,item.channel,attemptNumber,message]);
  }
}

export async function dispatchPendingNotifications(limit = env.NOTIFICATION_DISPATCH_BATCH_SIZE): Promise<{dispatched:number}> {
  const client=await pool.connect();
  let ids:string[]=[];
  try {
    await client.query('BEGIN');
    const rows=await client.query<{id:string}>(`SELECT id FROM notifications WHERE status='PENDING' AND created_at<=NOW() ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT $1`,[limit]);
    ids=rows.rows.map(r=>r.id);
    if(ids.length) await client.query(`UPDATE notifications SET status='PROCESSING' WHERE id = ANY($1::uuid[])`,[ids]);
    await client.query('COMMIT');
  }catch(e){ await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  for(const id of ids) await dispatchNotification(id);
  return {dispatched:ids.length};
}
