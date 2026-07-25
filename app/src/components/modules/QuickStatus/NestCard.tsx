import { House } from 'lucide-react';

import './StatusCard.css';

function NestCard() {
  return (
    <article className="status-card">
      <div className="status-card__header">
        <span className="status-card__icon">
          <House
            size={20}
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>

        <span className="status-card__label">
          Nest
        </span>
      </div>

      <strong className="status-card__primary">
        21.5°C
      </strong>

      <span className="status-card__secondary">
        Living room
      </span>

      <span className="status-card__footer status-card__footer--positive">
        Comfort
      </span>
    </article>
  );
}

export default NestCard;