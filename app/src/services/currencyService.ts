import { apiGet } from './apiClient';

const CURRENCY_CONFIG = {
  from: 'GBP',
  to: 'MAD',
  refreshMinutes: 60,
};

const STORAGE_KEY = 'GBP_MAD_RATE';

type ExchangeRateResponse = {
  rates: Record<string, number>;
};

export type RateMovement =
  | 'up'
  | 'down'
  | 'unchanged';

export type CurrencyData = {
  rate: number;
  from: string;
  to: string;
  movement: RateMovement;
  updatedAt: string;
};

function getStoredRate(): number | null {
  const storedRate =
    localStorage.getItem(STORAGE_KEY);

  if (!storedRate) {
    return null;
  }

  const parsedRate = Number.parseFloat(storedRate);

  return Number.isNaN(parsedRate)
    ? null
    : parsedRate;
}

function storeRate(rate: number): void {
  localStorage.setItem(
    STORAGE_KEY,
    rate.toString()
  );
}

function getMovement(
  currentRate: number,
  previousRate: number | null
): RateMovement {
  if (previousRate === null) {
    return 'unchanged';
  }

  if (currentRate > previousRate) {
    return 'up';
  }

  if (currentRate < previousRate) {
    return 'down';
  }

  return 'unchanged';
}

export async function getExchangeRate(): Promise<CurrencyData> {
  const url =
    `https://open.er-api.com/v6/latest/${CURRENCY_CONFIG.from}`;

  const data =
    await apiGet<ExchangeRateResponse>(url);

  const rate =
    data.rates[CURRENCY_CONFIG.to];

  if (typeof rate !== 'number') {
    throw new Error(
      `${CURRENCY_CONFIG.to} exchange rate unavailable`
    );
  }

  const previousRate = getStoredRate();

  const movement =
    getMovement(rate, previousRate);

  storeRate(rate);

  return {
    rate,
    from: CURRENCY_CONFIG.from,
    to: CURRENCY_CONFIG.to,
    movement,

    updatedAt: new Date().toLocaleTimeString(
      'en-GB',
      {
        hour: '2-digit',
        minute: '2-digit',
      }
    ),
  };
}

export const CURRENCY_REFRESH_MS =
  CURRENCY_CONFIG.refreshMinutes * 60 * 1000;