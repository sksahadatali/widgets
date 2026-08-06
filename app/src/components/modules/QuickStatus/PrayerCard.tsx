import {
  MoonStar,
  Sun,
  Sunrise,
  Sunset,
  Clock3,
  CalendarDays,
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
  const prayerTimes = [
    {
      name: 'Fajr',
      time: prayer?.timings.Fajr,
    },
    {
      name: 'Dhuhr',
      time: prayer?.timings.Dhuhr,
    },
    {
      name: 'Asr',
      time: prayer?.timings.Asr,
    },
    {
      name: 'Maghrib',
      time: prayer?.timings.Maghrib,
    },
    {
      name: 'Isha',
      time: prayer?.timings.Isha,
    },
  ];

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
          <div className="status-card__content">

            {/* LEFT COLUMN */}

            <div className="status-card__left">

              <strong className="status-card__primary">
                {prayer.name}
              </strong>

              <span className="status-card__secondary">
                {prayer.time}
                &nbsp; • &nbsp;
                {prayer.timeRemaining}
              </span>

              <div className="status-card__divider" />

              <div className="status-card__sunrise">

                <div className="status-card__sunrise-label">
                  <Sunrise
                    size={18}
                    strokeWidth={2}
                  />

                  <span>Sunrise</span>
                </div>

                <strong>
                  {prayer.timings.Sunrise}
                </strong>

              </div>

              <div className="status-card__footer">

                <CalendarDays
                  size={16}
                  strokeWidth={2}
                />

                <span>{prayer.hijriDate}</span>

              </div>

            </div>

            {/* RIGHT COLUMN */}

            <div className="status-card__right">

              {prayerTimes.map(item => (

                <div
                  key={item.name}
                  className={`status-card__prayer ${
                    prayer.name === item.name
                      ? 'status-card__prayer--active'
                      : ''
                  }`}
                >

                  <span>{item.name}</span>

                  <strong>{item.time}</strong>

                </div>

              ))}

            </div>

          </div>
        </>
      ) : null}
    </article>
  );
}

export default PrayerCard;