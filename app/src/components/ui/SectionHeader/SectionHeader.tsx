import type { ReactNode } from 'react';

import './SectionHeader.css';

type SectionHeaderProps = {
  title: string;
  eyebrow?: string;
  metadata?: ReactNode;
  className?: string;
};

function SectionHeader({
  title,
  eyebrow,
  metadata,
  className = '',
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
          {title}
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