const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  travelMinutes: number;
  distanceKm: number;
}

let cachedRoute: RouteInfo | null = null;
let lastUpdated: Date | null = null;

export function getCachedTravelInfo(): RouteInfo | null {
  return cachedRoute;
}

export function getLastTravelUpdate(): Date | null {
  return lastUpdated;
}

async function geocode(address: string): Promise<Coordinates> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Google Geocoding request failed.');
  }

  const data = await response.json();

  if (
    data.status !== 'OK' ||
    !data.results?.length
  ) {
    throw new Error(`Unable to geocode address: ${address}`);
  }

  const location = data.results[0].geometry.location;

  return {
    latitude: location.lat,
    longitude: location.lng,
  };
}

export async function refreshTravelInfo(
  originAddress: string,
  destinationAddress: string,
): Promise<RouteInfo> {

  const origin =
    await geocode(originAddress);

  const destination =
    await geocode(destinationAddress);

  const response =
    await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': API_KEY,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify({
          origin: {
            location: {
              latLng: {
                latitude: origin.latitude,
                longitude: origin.longitude,
              },
            },
          },
          destination: {
            location: {
              latLng: {
                latitude: destination.latitude,
                longitude: destination.longitude,
              },
            },
          },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE',
        }),
      },
    );

  if (!response.ok) {
    throw new Error('Google Routes API request failed.');
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error('No route found.');
  }

  const route = data.routes[0];

  cachedRoute = {
    travelMinutes:
      Math.round(
        parseInt(
          route.duration.replace('s', ''),
          10,
        ) / 60,
      ),

    distanceKm:
      Math.round(
        route.distanceMeters / 1000,
      ),
  };

  lastUpdated = new Date();

  return cachedRoute;
}