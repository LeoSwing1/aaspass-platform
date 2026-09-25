import { env } from '../../config/env.js';
import { haversineKm } from './serviceability.js';

type Point = { latitude:number; longitude:number };

export async function estimateRoute(input:{origin:Point;destination:Point;travelMode?:'TWO_WHEELER'|'DRIVE'|'BICYCLE'|'WALK'}):Promise<{distanceKm:number;durationMinutes:number;provider:string}> {
  if (env.MAPS_PROVIDER === 'google-routes' && env.GOOGLE_ROUTES_API_KEY) {
    const response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method:'POST',
      headers:{
        'content-type':'application/json',
        'x-goog-api-key':env.GOOGLE_ROUTES_API_KEY,
        'x-goog-fieldmask':'routes.distanceMeters,routes.duration',
      },
      body:JSON.stringify({
        origin:{location:{latLng:{latitude:input.origin.latitude,longitude:input.origin.longitude}}},
        destination:{location:{latLng:{latitude:input.destination.latitude,longitude:input.destination.longitude}}},
        travelMode:input.travelMode??'TWO_WHEELER',
        routingPreference:'TRAFFIC_AWARE',
      }),
    });
    if (response.ok) {
      const raw=await response.json() as {routes?:Array<{distanceMeters?:number;duration?:string}>};
      const route=raw.routes?.[0];
      if(route?.distanceMeters && route.duration){
        const seconds=Number(String(route.duration).replace('s',''));
        if(Number.isFinite(seconds)){
          return {distanceKm:route.distanceMeters/1000,durationMinutes:Math.ceil(seconds/60),provider:'google-routes'};
        }
      }
    }
  }
  const distanceKm=haversineKm(input.origin,input.destination);
  const averageKph=input.travelMode==='WALK'?5:input.travelMode==='BICYCLE'?14:input.travelMode==='DRIVE'?22:18;
  return {distanceKm,durationMinutes:Math.max(1,Math.ceil(distanceKm/averageKph*60)),provider:'haversine-fallback'};
}
