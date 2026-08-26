export type DisplayProfilePreference =
  | 'auto'
  | 'compact'
  | 'desktop'
  | 'elo-touch';

export type EffectiveDisplayProfile =
  Exclude<DisplayProfilePreference, 'auto'>;

export type ViewportSize = {
  width: number;
  height: number;
};

export type DisplayProfileOption = {
  id: DisplayProfilePreference;
  name: string;
  description: string;
};

export const DISPLAY_PROFILE_OPTIONS:
  DisplayProfileOption[] = [
    {
      id: 'auto',
      name: 'Auto',
      description:
        'Adapts to the available viewport and uses touch capability only as a supporting signal.',
    },
    {
      id: 'compact',
      name: 'Compact',
      description:
        'A coherent, space-efficient layout for laptop displays and smaller windows.',
    },
    {
      id: 'desktop',
      name: 'Desktop',
      description:
        'Balanced spacing and information density for external monitors and desktop use.',
    },
    {
      id: 'elo-touch',
      name: 'Elo Touch',
      description:
        'Larger controls, spacing and type for the wall-mounted household touchscreen.',
    },
  ];

export const DEFAULT_DISPLAY_PROFILE:
  DisplayProfilePreference = 'auto';

export function isDisplayProfilePreference(
  value: string | null
): value is DisplayProfilePreference {
  return DISPLAY_PROFILE_OPTIONS.some(
    profile => profile.id === value
  );
}

export function resolveEffectiveDisplayProfile(
  preference: DisplayProfilePreference,
  viewport: ViewportSize,
  touchCapable: boolean
): EffectiveDisplayProfile {
  if (preference !== 'auto') {
    return preference;
  }

  if (
    viewport.width < 1440 ||
    viewport.height < 800
  ) {
    return 'compact';
  }

  const hasLargeTouchViewport =
    viewport.width >= 1720 &&
    viewport.height >= 900 &&
    touchCapable;

  return hasLargeTouchViewport
    ? 'elo-touch'
    : 'desktop';
}

export function getDisplayProfileName(
  profile: DisplayProfilePreference
) {
  return (
    DISPLAY_PROFILE_OPTIONS.find(
      option => option.id === profile
    )?.name ?? profile
  );
}
