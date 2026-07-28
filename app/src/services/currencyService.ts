import { apiGet } from './apiClient';

const CURRENCY_CONFIG = {
  from: 'GBP',
  targets: ['MAD', 'INR', 'USD'],
  refreshMinutes: 60,
} as const;

const STORAGE_KEY = 'GBP_RATES';

type ExchangeRateResponse = {
  rates: Record<string, number>;
};

export type RateMovement =
  | 'up'
  | 'down'
  | 'unchanged';

export type CurrencyRate = {
  code: string;
  rate: number;
  movement: RateMovement;
};

export type CurrencyData = {
  from: string;
  rates: CurrencyRate[];
  updatedAt: string;
};

function getStoredRates(): Record<string, number> {
  const storedRates = localStorage.getItem(STORAGE_KEY);

  if (!storedRates) {
    return {};
  }

  try {
    const parsedRates = JSON.parse(storedRates) as unknown;

    if (
      typeof parsedRates !== 'object' ||
      parsedRates === null
    ) {
      return {};
    }

    return parsedRates as Record<string, number>;
  } catch {
    return {};
  }
}

function storeRates(
  rates: Record<string, number>
): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(rates)
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

  const previousRates = getStoredRates();

  const rates: CurrencyRate[] =
    CURRENCY_CONFIG.targets.map((code) => {
      const rate = data.rates[code];

      if (typeof rate !== 'number') {
        throw new Error(
          `${code} exchange rate unavailable`
        );
      }

      return {
        code,
        rate,
        movement: getMovement(
          rate,
          previousRates[code] ?? null
        ),
      };
    });

  storeRates(
    Object.fromEntries(
      rates.map(({ code, rate }) => [
        code,
        rate,
      ])
    )
  );

  return {
    from: CURRENCY_CONFIG.from,
    rates,
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
