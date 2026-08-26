import {
  forwardRef,
} from 'react';

import './Avatar.css';

type AvatarProps = {
  name: string;
  imageUrl?: string;
  onClick?: () => void;
  ariaLabel?: string;
  ariaExpanded?: boolean;
  ariaControls?: string;
  ariaHasPopup?: 'dialog' | 'menu';
};

const Avatar = forwardRef<
  HTMLButtonElement,
  AvatarProps
>(function Avatar(
  {
    name,
    imageUrl,
    onClick,
    ariaLabel = 'User profile',
    ariaExpanded,
    ariaControls,
    ariaHasPopup,
  },
  ref
) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <button
      ref={ref}
      type="button"
      className="avatar"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-haspopup={ariaHasPopup}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} />
      ) : (
        <span>{initials}</span>
      )}
    </button>
  );
});

export default Avatar;
