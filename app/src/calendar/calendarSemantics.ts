import type {
  CalendarEvent,
} from './calendarModel';

export const SCHOOL_SEMANTIC_KINDS = [
  'school.training-day',
  'school.holiday',
  'school.reopens',
] as const;

export type SchoolSemanticKind =
  typeof SCHOOL_SEMANTIC_KINDS[number];

export type CalendarSemanticRule = {
  sourceId: string;
  kind: SchoolSemanticKind;
  titleEquals?: string;
  titleIncludes?: string;
  label?: string;
};

export type CalendarEventSemantic = {
  kind: SchoolSemanticKind;
  label?: string;
};

const MAX_SOURCE_ID_LENGTH = 80;
const MAX_MATCH_LENGTH = 200;
const MAX_LABEL_LENGTH = 80;
const MIN_CONTAINS_LENGTH = 3;
const SOURCE_ID_PATTERN =
  /^[a-z0-9][a-z0-9._-]*$/i;

function containsControlCharacter(
  value: string
): boolean {
  return [...value].some(character => {
    const codePoint = character.codePointAt(0) ?? 0;

    return codePoint < 32 || codePoint === 127;
  });
}

function normalizeText(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en-GB');
}

function isSupportedKind(
  value: string
): value is SchoolSemanticKind {
  return SCHOOL_SEMANTIC_KINDS.includes(
    value as SchoolSemanticKind
  );
}

function normalizeLabel(
  value: unknown
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const label = value.trim();

  if (
    !label ||
    label.length > MAX_LABEL_LENGTH ||
    containsControlCharacter(label)
  ) {
    return undefined;
  }

  return label;
}

export function isValidCalendarSemanticRule(
  value: unknown
): value is CalendarSemanticRule {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return false;
  }

  const rule = value as Record<string, unknown>;
  const allowedKeys = new Set([
    'sourceId',
    'kind',
    'titleEquals',
    'titleIncludes',
    'label',
  ]);

  if (
    Object.keys(rule).some(
      key => !allowedKeys.has(key)
    )
  ) {
    return false;
  }

  const sourceId =
    typeof rule.sourceId === 'string'
      ? rule.sourceId.trim()
      : '';
  const kind =
    typeof rule.kind === 'string'
      ? rule.kind.trim()
      : '';
  const titleEquals =
    typeof rule.titleEquals === 'string'
      ? rule.titleEquals.trim()
      : '';
  const titleIncludes =
    typeof rule.titleIncludes === 'string'
      ? rule.titleIncludes.trim()
      : '';
  const hasEquals = Boolean(titleEquals);
  const hasIncludes = Boolean(titleIncludes);

  if (
    !sourceId ||
    sourceId.length > MAX_SOURCE_ID_LENGTH ||
    !SOURCE_ID_PATTERN.test(sourceId) ||
    !isSupportedKind(kind) ||
    (
      rule.titleEquals !== undefined &&
      typeof rule.titleEquals !== 'string'
    ) ||
    (
      rule.titleIncludes !== undefined &&
      typeof rule.titleIncludes !== 'string'
    ) ||
    hasEquals === hasIncludes ||
    titleEquals.length > MAX_MATCH_LENGTH ||
    titleIncludes.length > MAX_MATCH_LENGTH ||
    containsControlCharacter(titleEquals) ||
    containsControlCharacter(titleIncludes) ||
    (
      hasIncludes &&
      titleIncludes.length < MIN_CONTAINS_LENGTH
    ) ||
    (
      rule.label !== undefined &&
      normalizeLabel(rule.label) === undefined
    )
  ) {
    return false;
  }

  return true;
}

type MarkerResult =
  | { state: 'absent' }
  | { state: 'invalid' }
  | {
      state: 'valid';
      semantic: CalendarEventSemantic;
    };

function parseSemanticMarker(
  description: string
): MarkerResult {
  const markerLines = description
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      /^eyos\.(?:kind|label)\b/i.test(line)
    );

  if (markerLines.length === 0) {
    return { state: 'absent' };
  }

  const kindLines = markerLines.filter(
    line => line.startsWith('eyos.kind=')
  );
  const labelLines = markerLines.filter(
    line => line.startsWith('eyos.label=')
  );

  if (
    kindLines.length !== 1 ||
    labelLines.length > 1 ||
    kindLines.length + labelLines.length !==
      markerLines.length
  ) {
    return { state: 'invalid' };
  }

  const kind = kindLines[0]
    .slice('eyos.kind='.length)
    .trim();

  if (!isSupportedKind(kind)) {
    return { state: 'invalid' };
  }

  const label = labelLines.length === 1
    ? normalizeLabel(
        labelLines[0].slice(
          'eyos.label='.length
        )
      )
    : undefined;

  if (
    labelLines.length === 1 &&
    label === undefined
  ) {
    return { state: 'invalid' };
  }

  return {
    state: 'valid',
    semantic: {
      kind,
      ...(label ? { label } : {}),
    },
  };
}

function semanticFromRules(
  event: CalendarEvent,
  rules: readonly CalendarSemanticRule[]
): CalendarEventSemantic | null {
  const eventTitle = normalizeText(event.title);
  const validRules = rules.filter(
    rule =>
      isValidCalendarSemanticRule(rule) &&
      rule.sourceId.trim() === event.source.id
  );
  const exactMatches = validRules.filter(
    rule =>
      rule.titleEquals !== undefined &&
      normalizeText(rule.titleEquals) === eventTitle
  );
  const matches = exactMatches.length > 0
    ? exactMatches
    : validRules.filter(
        rule =>
          rule.titleIncludes !== undefined &&
          eventTitle.includes(
            normalizeText(rule.titleIncludes)
          )
      );

  if (matches.length === 0) {
    return null;
  }

  const semantics = new Map<
    string,
    CalendarEventSemantic
  >();

  matches.forEach(rule => {
    const label = rule.label
      ? normalizeLabel(rule.label)
      : undefined;
    const semantic = {
      kind: rule.kind,
      ...(label ? { label } : {}),
    };

    semantics.set(
      `${semantic.kind}\u0000${semantic.label ?? ''}`,
      semantic
    );
  });

  return semantics.size === 1
    ? [...semantics.values()][0]
    : null;
}

export function classifyCalendarEvent(
  event: CalendarEvent,
  rules: readonly CalendarSemanticRule[]
): CalendarEventSemantic | null {
  if (event.source.kind !== 'school') {
    return null;
  }

  const marker = parseSemanticMarker(
    event.description
  );

  if (marker.state === 'valid') {
    return marker.semantic;
  }

  if (marker.state === 'invalid') {
    return null;
  }

  return semanticFromRules(event, rules);
}
