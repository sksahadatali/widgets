import { getHouseholdConfig } from '../config/householdConfig.js';

type Coordinates = { latitude: number; longitude: number };

function apiKey(): string {
  const value = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!value) throw new Error('Travel provider is not configured.');
  return value;
}

async function geocode(address: string, fetcher: typeof fetch): Promise<Coordinates> {
  const parameters = new URLSearchParams({ address, key: apiKey() });
  const response = await fetcher(`https://maps.googleapis.com/maps/api/geocode/json?${parameters}`);
  if (!response.ok) throw new Error('Travel geocoding failed.');
  const value = await response.json() as { status?: string; results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }> };
  const location = value.results?.[0]?.geometry?.location;
  if (value.status !== 'OK' || typeof location?.lat !== 'number' || typeof location.lng !== 'number') throw new Error('Travel location could not be resolved.');
  return { latitude: location.lat, longitude: location.lng };
}

export async function getRoute(destination: string, fetcher: typeof fetch = fetch) {
  const originAddress = getHouseholdConfig().travel.homeAddress;
  const [origin, target] = await Promise.all([geocode(originAddress, fetcher), geocode(destination, fetcher)]);
  const response = await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey(), 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
    body: JSON.stringify({ origin: { location: { latLng: origin } }, destination: { location: { latLng: target } }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE' }),
  });
  if (!response.ok) throw new Error('Travel route request failed.');
  const value = await response.json() as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
  const route = value.routes?.[0];
  if (!route?.duration || typeof route.distanceMeters !== 'number') throw new Error('No route found.');
  return { travelMinutes: Math.round(Number.parseInt(route.duration.replace('s', ''), 10) / 60), distanceKm: Math.round(route.distanceMeters / 1000) };
}
