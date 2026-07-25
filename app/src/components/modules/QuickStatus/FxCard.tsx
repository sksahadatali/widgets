import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BadgePoundSterling,
} from 'lucide-react';

import { useExchangeRate } from '../../../hooks/useExchangeRate';

import './StatusCard.css';

function FxCard() {
  const {
    currency,
    loading,
    error,
  } = useExchangeRate();

  function getMovementIcon() {
    if (!currency) {
      return null;
    }

    switch (currency.movement) {
      case 'up':
        return (
          <ArrowUp
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        );

      case 'down':
        return (
          <ArrowDown
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        );

      default:
        return (
          <ArrowRight
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        );
    }
  }

  return (
    <article className="status-card">
      <div className="status-card__header">
        <span className="status-card__icon">
          <BadgePoundSterling
            size={20}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <span className="status-card__label">
          GBP / MAD
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
          <strong className="status-card__primary">
            {currency.rate.toFixed(2)}
          </strong>

          <span className="status-card__secondary">
            {currency.from} → {currency.to}
          </span>

          <span
            className={`status-card__footer ${
              currency.movement === 'up'
                ? 'status-card__footer--positive'
                : ''
            }`}
          >
            {getMovementIcon()}
            {' '}
            Updated {currency.updatedAt}
          </span>
        </>
      ) : null}
    </article>
  );
}

export default FxCard;