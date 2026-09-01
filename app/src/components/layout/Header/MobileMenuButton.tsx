import { Menu } from 'lucide-react';
import {
  type RefObject,
} from 'react';

type MobileMenuButtonProps = {
  isMenuOpen: boolean;
  menuTriggerRef?: RefObject<HTMLButtonElement | null>;
  onMenuToggle: () => void;
};

export function MobileMenuButton({
  isMenuOpen,
  menuTriggerRef,
  onMenuToggle,
}: MobileMenuButtonProps) {
  return (
    <button
      ref={menuTriggerRef}
      type="button"
      className="header__menu-button"
      aria-label="Open navigation menu"
      aria-expanded={isMenuOpen}
      aria-controls="primary-navigation-drawer"
      onClick={onMenuToggle}
    >
      <Menu size={23} aria-hidden="true" />
    </button>
  );
}
