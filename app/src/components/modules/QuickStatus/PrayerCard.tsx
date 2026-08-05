import {
  MoonStar,
  Sun,
  Sunrise,
  Sunset,
  Clock3,
} from 'lucide-react';

import { usePrayerTimes } from '../../../hooks/usePrayerTimes';

import './StatusCard.css';

function getPrayerIcon(
  prayerName: string
) {
  switch (prayerName) {
    case 'Fajr':
      return (
        <Sunrise
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    case 'Dhuhr':
      return (
        <Sun
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    case 'Asr':
      return (
        <Clock3
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    case 'Maghrib':
      return (
        <Sunset
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    case 'Isha':
      return (
        <MoonStar
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      );

    default:
      return (
        <MoonStar
          size={20}
          strokeWidth={2}
          aria-hidden="true"
        />
      );
  }
}

function PrayerCard() {
  const {
    prayer,
    loading,
    error,
  } = usePrayerTimes();

  const icon = prayer
    ? getPrayerIcon(prayer.name)
    : (
      <MoonStar
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
          Next Prayer
        </span>
      </div>

      {loading && !prayer ? (
        <>
          <strong className="status-card__primary">
            --
          </strong>

          <span className="status-card__secondary">
            Loading...
          </span>
        </>
      ) : error && !prayer ? (
        <>
          <strong className="status-card__primary">
            --
          </strong>

          <span className="status-card__secondary">
            Unavailable
          </span>

          <span className="status-card__footer">
            Prayer update failed
          </span>
        </>
      ) : prayer ? (
        <>
          <strong className="status-card__primary">
            {prayer.name}
          </strong>

          <span className="status-card__secondary">
            {prayer.time}
          </span>

          <span className="status-card__footer">
            {prayer.timeRemaining}
          </span>
        </>
      ) : null}
    </article>
  );
}

export default PrayerCard;