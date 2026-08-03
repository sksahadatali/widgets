const API_KEY =
  import.meta.env.VITE_TOMTOM_API_KEY ?? '';

const BASE_URL =
  'https://api.tomtom.com/routing/1/calculateRoute';

export async function getTomTomTravelTime(
  origin: string,
  destination: string
): Promise<number | null> {

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
      `/json?` +
      `traffic=true&` +
      `key=${API_KEY}`;

    const response =
      await fetch(url);

    if (!response.ok) {
      throw new Error(
        `TomTom request failed (${response.status})`
      );
    }

    const data =
      await response.json();

    const seconds =
      data.routes?.[0]?.summary?.travelTimeInSeconds;

    if (
      typeof seconds !== 'number'
    ) {
      return null;
    }

    return Math.round(
      seconds / 60
    );

  } catch (error) {

    console.error(
      'TomTom routing failed:',
      error
    );

    return null;
  }
}