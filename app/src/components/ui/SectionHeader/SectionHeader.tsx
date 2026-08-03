import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

import './SectionHeader.css';

type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  metadata?: ReactNode;
  className?: string;
  icon?: LucideIcon;
};

function SectionHeader({
  title,
  eyebrow,
  metadata,
  className = '',
  icon: Icon,
}: SectionHeaderProps) {
  const classes = ['section-header', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="section-header__content">
        {eyebrow && (
          <span className="section-header__eyebrow">
            {eyebrow}
          </span>
        )}
        <h2 className="section-header__title">
          {Icon && (
            <Icon
              size={20}
              strokeWidth={2}
              className="section-header__icon"
              aria-hidden="true"
            />
          )}

          <span>{title}</span>
        </h2>
      </div>

      {metadata && (
        <div className="section-header__metadata">
          {metadata}
        </div>
      )}
    </div>
  );
}

export default SectionHeader;