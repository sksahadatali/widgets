export interface RouteInfo {
  travelMinutes: number;
  trafficDelayMinutes: number;
  distanceKm: number;
}

// TomTom remains inactive; provider credentials are server-only.
const API_KEY = '';

const BASE_URL =
  'https://api.tomtom.com/routing/1/calculateRoute';

export async function getRoute(
  origin: string,
  destination: string
): Promise<RouteInfo | null> {

  if (!API_KEY) {
    console.warn(
      'TomTom API key is missing.'
    );

    return null;
  }

  try {

    const url =
      `${BASE_URL}/` +
      `${encodeURIComponent(origin)}:` +
      `${encodeURIComponent(destination)}` +
      `/json` +
      `?traffic=true` +
      `&key=${API_KEY}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `TomTom request failed (${response.status})`
      );
    }

    const data =
      await response.json();

    const summary =
      data.routes?.[0]?.summary;

    if (!summary) {
      return null;
    }

    return {

      travelMinutes:
        Math.round(
          summary.travelTimeInSeconds / 60
        ),

      trafficDelayMinutes:
        Math.round(
          summary.trafficDelayInSeconds / 60
        ),

      distanceKm:
        Number(
          (
            summary.lengthInMeters /
            1000
          ).toFixed(1)
        ),

    };

  } catch (error) {

    console.error(
      'TomTom routing failed:',
      error
    );

    return null;
  }
}
