import type { ReactNode } from 'react';

import './StatusChip.css';

type StatusChipVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

type StatusChipProps = {
  label: string;
  variant?: StatusChipVariant;
  icon?: ReactNode;
  className?: string;
};

function StatusChip({
  label,
  variant = 'default',
  icon,
  className = '',
}: StatusChipProps) {
  const classes = [
    'status-chip',
    `status-chip--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes}>
      {icon && (
        <span
          className="status-chip__icon"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}

      <span className="status-chip__label">
        {label}
      </span>
    </span>
  );
}

export default StatusChip;