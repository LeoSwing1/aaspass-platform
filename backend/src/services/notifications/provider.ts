import { fcmConfigured, whatsappConfigured, sendFcm, sendWhatsAppText } from './service.js';

export { fcmConfigured, whatsappConfigured, sendFcm, sendWhatsAppText };

export function notificationsConfigured(): boolean {
  return fcmConfigured();
}

export function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, '\n');
}

export async function sendPush(input: { token: string; title: string; body: string; data?: Record<string,string> }): Promise<{ queued:boolean; provider:string; messageId?:string }> {
  const result = await sendFcm(input.token,input.title,input.body,input.data ?? {});
  return { queued:true, provider:'fcm', messageId:result.messageId };
}
