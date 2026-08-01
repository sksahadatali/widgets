import { Thermometer } from 'lucide-react';

import { useNest } from '../../../hooks/useNest';

import './StatusCard.css';

function NestCard() {
  const { nest, loading, error } = useNest();

  const reconnectRequired =
    error?.includes('Authentication expired') ||
    error?.includes('Reconnection required');

  const displayMode =
    nest?.ecoMode === 'MANUAL_ECO'
      ? 'Eco'
      : nest?.thermostatMode === 'HEAT'
        ? 'Heat'
        : nest?.thermostatMode === 'OFF'
          ? 'Off'
          : 'Unknown';

  return (
    <article className="status-card">
      <div className="status-card__header">
        <span className="status-card__icon">
          <Thermometer
            size={20}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <span className="status-card__label">
          Nest
        </span>
      </div>

      {loading && !nest ? (
        <>
          <strong className="status-card__primary">
            --°C
          </strong>

          <span className="status-card__secondary">
            Loading...
          </span>
        </>
      ) : reconnectRequired ? (
        <>
          <strong className="status-card__primary">
            Reconnect
          </strong>

          <span className="status-card__secondary">
            Google authentication expired
          </span>

          <span className="status-card__footer">
            Re-authorisation required
          </span>
        </>
      ) : error && !nest ? (
        <>
          <strong className="status-card__primary">
            --°C
          </strong>

          <span className="status-card__secondary">
            Unavailable
          </span>

          <span className="status-card__footer">
            Nest update failed
          </span>
        </>
      ) : nest ? (
        <>
          <strong className="status-card__primary">
            {nest.temperatureCelsius === null
              ? '--°C'
              : `${nest.temperatureCelsius.toFixed(1)}°C`}
          </strong>

          <span className="status-card__secondary">
            {nest.room}
          </span>

          <span className="status-card__secondary">
            {displayMode} ·{' '}
            {nest.heating
              ? 'Heating on'
              : 'Heating off'}
          </span>

          <span className="status-card__footer">
            Humidity{' '}
            {nest.humidityPercent === null
              ? '--'
              : `${nest.humidityPercent}%`}
            {' · '}
            {nest.online ? 'Online' : 'Offline'}
          </span>
        </>
      ) : null}
    </article>
  );
}

export default NestCard;