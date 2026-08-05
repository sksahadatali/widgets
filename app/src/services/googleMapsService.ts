const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RouteInfo {
  travelMinutes: number;
  distanceKm: number;
}

type CachedRoute = {
  origin: string;
  destination: string;
  route: RouteInfo;
  updatedAt: Date;
};

let cachedRoute: CachedRoute | null = null;

export function getCachedTravelInfo(): RouteInfo | null {
  return cachedRoute?.route ?? null;
}

export function getLastTravelUpdate(): Date | null {
  return cachedRoute?.updatedAt ?? null;
}

async function geocode(
  address: string,
): Promise<Coordinates> {

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${API_KEY}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      'Google Geocoding request failed.'
    );
  }

  const data = await response.json();

  if (
    data.status !== 'OK' ||
    !data.results?.length
  ) {
    throw new Error(
      `Unable to geocode address: ${address}`
    );
  }

  const location =
    data.results[0].geometry.location;

  return {
    latitude: location.lat,
    longitude: location.lng,
  };
}

/**
 * Performs an actual Google Maps refresh.
 */
async function refreshTravelInfo(
  originAddress: string,
  destinationAddress: string,
): Promise<RouteInfo> {

  const origin =
    await geocode(originAddress);

  const destination =
    await geocode(destinationAddress);
  
  console.log('Origin address:', originAddress);
  console.log('Destination address:', destinationAddress);
  
  console.log('Origin coordinates:', origin);
  console.log('Destination coordinates:', destination);  

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
    throw new Error(
      'Google Routes API request failed.'
    );
  }

  const data = await response.json();

  if (!data.routes?.length) {
    throw new Error(
      'No route found.'
    );
  }

  const route =
    data.routes[0];
  
  console.log('Google route:', route);  

  const routeInfo: RouteInfo = {
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

  cachedRoute = {
    origin: originAddress,
    destination: destinationAddress,
    route: routeInfo,
    updatedAt: new Date(),
  };

  return routeInfo;
}

/**
 * Intelligent refresh policy.
 */
export async function refreshTravelInfoIfNeeded(
  originAddress: string,
  destinationAddress: string,
  leaveTime: Date,
): Promise<RouteInfo> {

  const now = Date.now();

  const minutesUntilLeave =
    (
      leaveTime.getTime() -
      now
    ) /
    (1000 * 60);

  let refreshInterval = 60;

  if (minutesUntilLeave <= 10) {
    refreshInterval = 1;
  } else if (minutesUntilLeave <= 30) {
    refreshInterval = 5;
  } else if (minutesUntilLeave <= 60) {
    refreshInterval = 10;
  } else if (minutesUntilLeave <= 180) {
    refreshInterval = 30;
  }

  if (
    cachedRoute &&
    cachedRoute.origin === originAddress &&
    cachedRoute.destination === destinationAddress
  ) {

    const cacheAgeMinutes =
      (
        now -
        cachedRoute.updatedAt.getTime()
      ) /
      (1000 * 60);

    if (
      cacheAgeMinutes <
      refreshInterval
    ) {
      return cachedRoute.route;
    }

  }

  return refreshTravelInfo(
    originAddress,
    destinationAddress,
  );
}