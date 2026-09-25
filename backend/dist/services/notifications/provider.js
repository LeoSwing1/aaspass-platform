import { fcmConfigured, whatsappConfigured, sendFcm, sendWhatsAppText } from './service.js';
export { fcmConfigured, whatsappConfigured, sendFcm, sendWhatsAppText };
export function notificationsConfigured() {
    return fcmConfigured();
}
export function normalizePrivateKey(value) {
    return value.replace(/\\n/g, '\n');
}
export async function sendPush(input) {
    const result = await sendFcm(input.token, input.title, input.body, input.data ?? {});
    return { queued: true, provider: 'fcm', messageId: result.messageId };
}
