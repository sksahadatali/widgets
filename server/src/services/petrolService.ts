import axios from 'axios';

const BASE_URL = 'https://www.fuel-finder.service.gov.uk';

let accessToken = '';
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {

  // Reuse cached token
  if (accessToken && Date.now() < tokenExpiresAt) {
    console.log('[API] Using cached token');
    return accessToken;
  }

  console.log('[API] Requesting new access token...');

  const params = new URLSearchParams();

  params.append('grant_type', 'client_credentials');
  params.append(
    'client_id',
    process.env.FUEL_FINDER_CLIENT_ID!
  );
  params.append(
    'client_secret',
    process.env.FUEL_FINDER_CLIENT_SECRET!
  );
  params.append(
    'scope',
    process.env.FUEL_FINDER_SCOPE || 'fuelfinder.read'
  );

  const response = await axios.post(
    `${BASE_URL}/api/v1/oauth/generate_access_token`,
    params.toString(),
    {
      headers: {
        Accept: 'application/json',
        'Content-Type':
          'application/x-www-form-urlencoded',
      },
    }
  );

  accessToken = response.data.data.access_token;

  const expiresIn =
    response.data.data.expires_in ?? 3600;

  tokenExpiresAt =
    Date.now() + (expiresIn - 300) * 1000;

  return accessToken;
}

async function fetchAllBatches(
  path: string,
  headers: any
): Promise<any[]> {

  const results: any[] = [];

  let batch = 1;

  while (true) {

    try {

      const response = await axios.get(
        `${BASE_URL}${path}`,
        {
          headers,
          params: {
            'batch-number': batch,
          },
        }
      );

      let rows: any[] = [];

      if (Array.isArray(response.data)) {
        rows = response.data;
      } else if (Array.isArray(response.data.data)) {
        rows = response.data.data;
      } else if (
        Array.isArray(response.data.data?.data)
      ) {
        rows = response.data.data.data;
      }

      console.log(
        `[API] ${path} - Batch ${batch}: ${rows.length} rows`
      );

      results.push(...rows);

      if (rows.length < 500) {
        break;
      }

      batch++;

    } catch (error: any) {

      if (error.response?.status === 404) {
        break;
      }

      throw error;

    }

  }

  return results;
}

export async function getPetrolPrice() {

  console.log('[API] Getting petrol price...');

  const token = await getAccessToken();

  const headers = {
    accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const [stations, prices] = await Promise.all([
    fetchAllBatches('/api/v1/pfs', headers),
    fetchAllBatches('/api/v1/pfs/fuel-prices', headers),
  ]);

  console.log(`[API] Stations: ${stations.length}`);
  console.log(`[API] Prices: ${prices.length}`);

  const station = stations.find(
    (s: any) =>
      s.brand_name?.toUpperCase() === 'MORRISONS' &&
      s.location?.postcode?.startsWith('LU7')
  );

  if (!station) {
    throw new Error(
      'Morrisons Leighton Buzzard not found.'
    );
  }

  console.log(
    '[API] Station found:',
    station.trading_name
  );

  const stationPrices = prices.find(
    (p: any) => p.node_id === station.node_id
  );

  if (!stationPrices) {
    throw new Error('Fuel prices not found.');
  }

  const e10 = stationPrices.fuel_prices.find(
    (fuel: any) => fuel.fuel_type === 'E10'
  );

  if (!e10) {
    throw new Error('E10 price not found.');
  }

  return {
    station: station.trading_name,
    petrolPrice: Number(e10.price),
    updatedAt: e10.price_last_updated,
  };
}