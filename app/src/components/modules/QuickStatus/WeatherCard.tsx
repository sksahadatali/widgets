import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from 'lucide-react';

import { useWeather } from '../../../hooks/useWeather';

import './StatusCard.css';

function getWeatherIcon(code: number) {
  if ([0, 1].includes(code)) {
    return (
      <Sun
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  if (code === 2) {
    return (
      <CloudSun
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  if (code === 3) {
    return (
      <Cloud
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  if ([45, 48].includes(code)) {
    return (
      <CloudFog
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  if ([51, 53, 55, 61, 63, 65, 80, 81].includes(code)) {
    return (
      <CloudRain
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  if ([71, 73, 75].includes(code)) {
    return (
      <CloudSnow
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  if (code === 95) {
    return (
      <CloudLightning
        size={20}
        strokeWidth={2}
        aria-hidden="true"
      />
    );
  }

  return (
    <Cloud
      size={20}
      strokeWidth={2}
      aria-hidden="true"
    />
  );
}

function getForecastIcon(icon: string) {
  switch (icon) {
    case 'cloud':
      return <Cloud size={16} strokeWidth={2} />;

    case 'partly-cloudy':
      return <CloudSun size={16} strokeWidth={2} />;

    case 'rain':
      return <CloudRain size={16} strokeWidth={2} />;

    default:
      return <Sun size={16} strokeWidth={2} />;
  }
}

function WeatherCard() {
  const { weather, loading, error } = useWeather();

  const icon = weather ? (
    getWeatherIcon(weather.weatherCode)
  ) : (
    <CloudSun
      size={20}
      strokeWidth={2}
      aria-hidden="true"
    />
  );

  return (
    <article className="status-card">
      <div className="status-card__header">
        <span className="status-card__icon">
          {icon}
        </span>

        <span className="status-card__label">
          Weather
        </span>
      </div>

      {loading && !weather ? (
        <>
          <strong className="status-card__primary">
            --°C
          </strong>

          <span className="status-card__secondary">
            Loading...
          </span>
        </>
      ) : error && !weather ? (
        <>
          <strong className="status-card__primary">
            --°C
          </strong>

          <span className="status-card__secondary">
            Unavailable
          </span>

          <span className="status-card__footer">
            Weather update failed
          </span>
        </>
      ) : weather ? (
        <>
          <div className="status-card__content">

            {/* LEFT */}

            <div className="status-card__weather-left">

              <strong className="status-card__primary">
                {weather.temperature}°C
              </strong>

              <span className="status-card__secondary">
                {weather.condition}
              </span>

              <div className="status-card__weather-divider" />

              <div className="status-card__weather-details">
                <span>H: {weather.high}°</span>

                <span>•</span>

                <span>L: {weather.low}°</span>

                <span>•</span>

                <span>💧 {weather.humidityPercent}%</span>
              </div>

              <span className="status-card__footer">
                Feels like {weather.feelsLike}° · Updated {weather.updatedAt}
              </span>

            </div>

            {/* RIGHT */}

            <div className="status-card__weather-right">

              {weather.forecast.map(day => (

                <div
                  key={day.day}
                  className="status-card__weather-forecast"
                >

                  <div className="status-card__weather-day">

                    {getForecastIcon(day.icon)}

                    <span>{day.day}</span>

                  </div>

                  <strong>{day.high}°/{day.low}°</strong>

                </div>

                ))}

            </div>

          </div>
        </>
      ) : null}
    </article>
  );
}

export default WeatherCard;