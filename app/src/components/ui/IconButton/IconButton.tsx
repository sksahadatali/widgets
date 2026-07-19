import type { LucideIcon } from 'lucide-react';
import './IconButton.css';

type IconButtonProps = {
  icon: LucideIcon;
  ariaLabel: string;
  onClick?: () => void;
  size?: number;
  disabled?: boolean;
};

function IconButton({
  icon: Icon,
  ariaLabel,
  onClick,
  size = 18,
  disabled = false,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={ariaLabel}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon size={size} strokeWidth={2} />
    </button>
  );
}

export default IconButton;