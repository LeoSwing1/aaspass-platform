import { env } from '../../config/env.js';
export function haversineKm(a, b) {
    const rad = (n) => (n * Math.PI) / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
export function isWithinAasPassPilot(customer) {
    const center = { latitude: env.DEFAULT_ZONE_LATITUDE, longitude: env.DEFAULT_ZONE_LONGITUDE };
    const radiusKm = env.DEFAULT_SERVICE_RADIUS_KM;
    const distanceKm = haversineKm(customer, center);
    return { serviceable: distanceKm <= radiusKm, zone: env.DEFAULT_ZONE_NAME, radiusKm };
}
