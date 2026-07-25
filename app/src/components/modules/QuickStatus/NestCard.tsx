import { useNest } from '../../../hooks/useNest';

function formatTemperature(
  temperature: number | null
): string {
  return temperature === null
    ? '--'
    : `${temperature.toFixed(1)}°`;
}

function getDisplayMode(
  ecoMode: string,
  thermostatMode: string
): string {
  if (ecoMode === 'MANUAL_ECO') {
    return 'Eco';
  }

  if (thermostatMode === 'HEAT') {
    return 'Heat';
  }

  if (thermostatMode === 'OFF') {
    return 'Off';
  }

  return 'Unknown';
}

export function NestCard() {
  const {
    data,
    loading,
    refreshing,
    error,
    refresh,
  } = useNest();

  if (loading && !data) {
    return (
      <article className="quick-status-card nest-card">
        <div className="quick-status-card__header">
          <span className="quick-status-card__label">
            Nest
          </span>
        </div>

        <div className="quick-status-card__value">
          --°
        </div>

        <div className="quick-status-card__meta">
          Loading thermostat…
        </div>
      </article>
    );
  }

  if (error && !data) {
    return (
      <article className="quick-status-card nest-card">
        <div className="quick-status-card__header">
          <span className="quick-status-card__label">
            Nest
          </span>

          <button
            type="button"
            className="quick-status-card__refresh"
            onClick={() => void refresh()}
            aria-label="Retry Nest connection"
          >
            Retry
          </button>
        </div>

        <div className="quick-status-card__value">
          --
        </div>

        <div className="quick-status-card__meta">
          Nest unavailable
        </div>
      </article>
    );
  }

  if (!data) {
    return null;
  }

  const displayMode = getDisplayMode(
    data.ecoMode,
    data.thermostatMode
  );

  const heatingText = data.heating
    ? 'Heating on'
    : 'Heating off';

  return (
    <article className="quick-status-card nest-card">
      <div className="quick-status-card__header">
        <span className="quick-status-card__label">
          Nest
        </span>

        <span
          className={`nest-card__connection ${
            data.online
              ? 'nest-card__connection--online'
              : 'nest-card__connection--offline'
          }`}
        >
          {data.online ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="quick-status-card__value">
        {formatTemperature(
          data.temperatureCelsius
        )}
      </div>

      <div className="quick-status-card__title">
        {data.room}
      </div>

      <div className="quick-status-card__meta">
        {displayMode} · {heatingText}
      </div>

      <div className="quick-status-card__secondary">
        Humidity{' '}
        {data.humidityPercent === null
          ? '--'
          : `${data.humidityPercent}%`}
      </div>

      {refreshing && (
        <div className="nest-card__refreshing">
          Updating…
        </div>
      )}

      {error && (
        <div className="nest-card__warning">
          Latest update failed
        </div>
      )}
    </article>
  );
}

export default NestCard;