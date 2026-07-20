import type { ReactNode } from 'react';

import './Card.css';

type CardProps = {
  children: ReactNode;
  className?: string;
};

function Card({ children, className = '' }: CardProps) {
  const classes = ['card', className].filter(Boolean).join(' ');

  return <section className={classes}>{children}</section>;
}

export default Card;