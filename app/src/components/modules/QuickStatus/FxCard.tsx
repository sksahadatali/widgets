import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Banknote,
} from 'lucide-react';
import { Fuel } from 'lucide-react';

import { useExchangeRate } from '../../../hooks/useExchangeRate';
import type { RateMovement } from '../../../services/currencyService';
import { usePetrol } from '../../../hooks/usePetrol';

import './StatusCard.css';

function getMovementIcon(
  movement: RateMovement
) {
  switch (movement) {
    case 'up':
      return (
        <ArrowUp
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    case 'down':
      return (
        <ArrowDown
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    default:
      return (
        <ArrowRight
          size={14}
          strokeWidth={2}
          aria-hidden="true"
        />
      );
  }
}

function getCurrencyLabel(
  code: string
): string {
  switch (code) {
    case 'MAD':
      return '🇲🇦 MAD';

    case 'INR':
      return '🇮🇳 INR';

    case 'USD':
      return '🇺🇸 USD';

    default:
      return code;
  }
}

function formatRate(
  code: string,
  value: number
): string {
  switch (code) {
    case 'MAD':
    case 'INR':
    case 'USD':
      return value.toFixed(2);

    default:
      return value.toFixed(2);
  }
}

function FxCard() {
  const {
    currency,
    loading,
    error,
  } = useExchangeRate();

  const {
    petrol,
  } = usePetrol();

  return (
    <article className="status-card">
      <div className="status-card__header">
        <span className="status-card__icon">
          <Banknote
            size={20}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <span className="status-card__label">
          Finance
        </span>
      </div>

      {loading && !currency ? (
        <>
          <strong className="status-card__primary">
            --.--
          </strong>

          <span className="status-card__secondary">
            Loading...
          </span>
        </>
      ) : error && !currency ? (
        <>
          <strong className="status-card__primary">
            --.--
          </strong>

          <span className="status-card__secondary">
            Unavailable
          </span>

          <span className="status-card__footer">
            Exchange rate update failed
          </span>
        </>
      ) : currency ? (
        <>
          <div className="status-card__rates">

          {currency.rates.map((rate) => (
            <div
              key={rate.code}
              className="status-card__rate"
            >
              <span className="status-card__rate-label">
                {getCurrencyLabel(rate.code)}
              </span>

              <span className="status-card__rate-value">
                <strong>
                  {formatRate(rate.code, rate.rate)}
                </strong>

                <span
                  className={`status-card__rate-movement status-card__rate-movement--${rate.movement}`}
                  aria-label={`${rate.code} rate ${rate.movement}`}
                >
                  {getMovementIcon(rate.movement)}
                </span>
              </span>
            </div>
          ))}

          {/* Petrol */}

          <div className="status-card__rate status-card__rate--petrol">

          <span className="status-card__rate-label">
            🇬🇧
            <Fuel
              size={14}
              strokeWidth={2}
              className="status-card__inline-icon"
            />
            {petrol?.station
              ? `Petrol - ${petrol.station
                  .replace('MFG ', '')
                  .replace(' LEIGHTON BUZZARD', '')}`
                  .toLowerCase()
                  .replace(/\b\w/g, c => c.toUpperCase())
              : 'Petrol'}
          </span>

            <span className="status-card__rate-value">
            <strong>
              {petrol
                ? `${petrol.petrolPrice.toFixed(1)}p/L`
                : '--.- p/L'}
            </strong>
            </span>

          </div>

          </div>

          <span className="status-card__footer">
            FX: {currency.updatedAt}

            {petrol && (
              <>
                {' • '}
                Petrol:{' '}
                {new Date(petrol.updatedAt).toLocaleDateString(
                  'en-GB',
                  {
                    day: '2-digit',
                    month: 'short',
                  }
                )}
              </>
            )}
          </span>
        </>
      ) : null}
    </article>
  );
}

export default FxCard;