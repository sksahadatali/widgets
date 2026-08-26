import {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  Check,
  Users,
} from 'lucide-react';

import Avatar from '../../ui/Avatar/Avatar';
import {
  getProfileInitials,
} from '../../../household/householdProfiles';
import {
  useHouseholdProfile,
} from '../../../household/useHouseholdProfile';

import './ProfileSwitcher.css';

const SWITCHER_ID =
  'household-profile-switcher';

function ProfileSwitcher() {
  const {
    profiles,
    selectedProfile,
    selectProfile,
  } = useHouseholdProfile();

  const [isOpen, setIsOpen] =
    useState(false);

  const containerRef =
    useRef<HTMLDivElement>(null);
  const panelRef =
    useRef<HTMLDivElement>(null);
  const triggerRef =
    useRef<HTMLButtonElement>(null);

  function closeAndReturnFocus() {
    setIsOpen(false);

    window.requestAnimationFrame(
      () => {
        triggerRef.current?.focus();
      }
    );
  }

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frameId =
      window.requestAnimationFrame(
        () => {
          panelRef.current
            ?.querySelector<HTMLButtonElement>(
              '[aria-pressed="true"]'
            )
            ?.focus();
        }
      );

    function handlePointerDown(
      event: PointerEvent
    ) {
      if (
        !containerRef.current?.contains(
          event.target as Node
        )
      ) {
        closeAndReturnFocus();
      }
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAndReturnFocus();
      }
    }

    document.addEventListener(
      'pointerdown',
      handlePointerDown
    );
    document.addEventListener(
      'keydown',
      handleKeyDown
    );

    return () => {
      window.cancelAnimationFrame(
        frameId
      );
      document.removeEventListener(
        'pointerdown',
        handlePointerDown
      );
      document.removeEventListener(
        'keydown',
        handleKeyDown
      );
    };
  }, [isOpen]);

  function handleSelect(
    profileId: string
  ) {
    selectProfile(profileId);
    closeAndReturnFocus();
  }

  return (
    <div
      className="profile-switcher"
      ref={containerRef}
    >
      <Avatar
        ref={triggerRef}
        name={selectedProfile.displayName}
        onClick={() =>
          setIsOpen(current => !current)
        }
        ariaLabel={
          `Switch household profile. Current profile: ${selectedProfile.displayName}`
        }
        ariaExpanded={isOpen}
        ariaControls={SWITCHER_ID}
        ariaHasPopup="dialog"
      />

      {isOpen && (
        <div
          id={SWITCHER_ID}
          ref={panelRef}
          className="profile-switcher__panel"
          role="dialog"
          aria-label="Choose household profile"
        >
          <span className="profile-switcher__title">
            Who is using eY OS?
          </span>

          <div className="profile-switcher__options">
            {profiles.map(profile => {
              const isSelected =
                profile.id ===
                selectedProfile.id;

              return (
                <button
                  key={profile.id}
                  type="button"
                  className={`profile-switcher__option ${
                    isSelected
                      ? 'profile-switcher__option--selected'
                      : ''
                  }`}
                  aria-pressed={isSelected}
                  onClick={() =>
                    handleSelect(profile.id)
                  }
                >
                  <span className="profile-switcher__option-avatar">
                    {profile.kind === 'family' ? (
                      <Users
                        size={20}
                        strokeWidth={2}
                        aria-hidden="true"
                      />
                    ) : (
                      getProfileInitials(
                        profile.displayName
                      )
                    )}
                  </span>

                  <span className="profile-switcher__option-name">
                    {profile.kind === 'family'
                      ? 'Family'
                      : profile.displayName}
                  </span>

                  {isSelected && (
                    <Check
                      className="profile-switcher__selected-icon"
                      size={18}
                      strokeWidth={2.5}
                      aria-label="Selected"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileSwitcher;
