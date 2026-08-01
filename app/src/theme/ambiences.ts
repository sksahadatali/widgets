export type AmbienceId =
  | 'olive'
  | 'ivory'
  | 'beige'
  | 'midnight'
  | 'executive'
  | 'arctic'
  | 'oled';

export type AmbienceDefinition = {
  id: AmbienceId;
  name: string;
  mode: 'light' | 'dark';
  description: string;
};

export const DEFAULT_AMBIENCE: AmbienceId =
  'midnight';

export const AMBIENCES: AmbienceDefinition[] = [
  {
    id: 'olive',
    name: 'Olive',
    mode: 'light',
    description:
      'Warm, natural and calm.',
  },
  {
    id: 'ivory',
    name: 'Ivory',
    mode: 'light',
    description:
      'Bright, elegant and minimal.',
  },
  {
    id: 'beige',
    name: 'Beige',
    mode: 'light',
    description:
      'Soft, warm and comfortable.',
  },
  {
    id: 'midnight',
    name: 'Midnight',
    mode: 'dark',
    description:
      'Deep navy for evening use.',
  },
  {
    id: 'executive',
    name: 'Executive',
    mode: 'dark',
    description:
      'Charcoal with restrained gold.',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    mode: 'light',
    description:
      'Crisp, clean and high contrast.',
  },
  {
    id: 'oled',
    name: 'OLED',
    mode: 'dark',
    description:
      'Pure black for dark environments.',
  },
];