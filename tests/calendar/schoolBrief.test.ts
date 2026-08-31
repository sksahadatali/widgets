import assert from 'node:assert/strict';
import {
  describe,
  it,
} from 'node:test';

import {
  selectSchoolBriefInsight,
} from '../../app/src/calendar/schoolBrief.ts';

import type {
  CalendarEvent,
} from '../../app/src/calendar/calendarModel.ts';

const TIME_ZONE = 'Europe/London';

function event(
  id: string,
  title: string,
  kind: 'school.training-day' | 'school.holiday' | 'school.reopens',
  startLocalDate: string,
  endLocalDateExclusive: string,
  options: {
    label?: string;
    sourceId?: string;
  } = {}
): CalendarEvent {
  const labelMarker = options.label
    ? `\neyos.label=${options.label}`
    : '';

  return {
    id,
    title,
    start: startLocalDate,
    end: endLocalDateExclusive,
    startLocalDate,
    endLocalDateExclusive,
    allDay: true,
    location: '',
    description: `eyos.kind=${kind}${labelMarker}`,
    calendarUrl: 'https://example.invalid/calendar',
    source: {
      id: options.sourceId ?? 'school',
      label: 'School',
      kind: 'school',
    },
  };
}

function select(
  events: CalendarEvent[],
  now = new Date('2026-08-30T10:00:00.000Z'),
  timeZone = TIME_ZONE
) {
  return selectSchoolBriefInsight(
    events,
    timeZone,
    now,
    []
  );
}

describe('School Brief transition selector', () => {
  it('surfaces a Training Day today', () => {
    assert.deepEqual(
      select([
        event(
          'training',
          'Training Day',
          'school.training-day',
          '2026-08-30',
          '2026-08-31'
        ),
      ]),
      {
        text: 'School closed today — Training Day',
        consumedEventIds: ['training'],
      }
    );
  });

  it('surfaces a Training Day tomorrow across a Sunday boundary', () => {
    assert.equal(
      select([
        event(
          'training',
          'Training Day',
          'school.training-day',
          '2026-08-31',
          '2026-09-01'
        ),
      ])?.text,
      'School closed tomorrow — Training Day'
    );
  });

  it('surfaces a holiday starting today', () => {
    assert.equal(
      select([
        event(
          'holiday',
          'Autumn half-term',
          'school.holiday',
          '2026-08-30',
          '2026-09-05'
        ),
      ])?.text,
      'Autumn half-term starts today'
    );
  });

  it('surfaces a holiday starting tomorrow across a month boundary', () => {
    assert.equal(
      select(
        [
          event(
            'holiday',
            'Autumn half-term',
            'school.holiday',
            '2026-09-01',
            '2026-09-05'
          ),
        ],
        new Date('2026-08-31T10:00:00.000Z')
      )?.text,
      'Autumn half-term starts tomorrow'
    );
  });

  it('does not repeat a closure message during an active holiday', () => {
    assert.equal(
      select([
        event(
          'holiday',
          'Autumn half-term',
          'school.holiday',
          '2026-08-24',
          '2026-08-31'
        ),
      ]),
      null
    );
  });

  it('surfaces an explicit reopening today', () => {
    assert.equal(
      select([
        event(
          'reopen',
          'School reopens',
          'school.reopens',
          '2026-08-30',
          '2026-08-31'
        ),
      ])?.text,
      'School reopens today'
    );
  });

  it('surfaces an explicit reopening tomorrow', () => {
    assert.equal(
      select([
        event(
          'reopen',
          'School reopens',
          'school.reopens',
          '2026-08-31',
          '2026-09-01'
        ),
      ])?.text,
      'School reopens tomorrow'
    );
  });

  it('uses the future civil weekday for a later explicit reopening', () => {
    assert.equal(
      select([
        event(
          'reopen',
          'School reopens',
          'school.reopens',
          '2026-09-03',
          '2026-09-04'
        ),
      ])?.text,
      'School reopens Thursday'
    );
  });

  it('associates reopening with the nearest deterministic preceding holiday', () => {
    assert.equal(
      select([
        event(
          'holiday',
          'Autumn half-term',
          'school.holiday',
          '2026-08-24',
          '2026-09-03'
        ),
        event(
          'reopen',
          'School reopens',
          'school.reopens',
          '2026-09-03',
          '2026-09-04'
        ),
      ])?.text,
      'School reopens Thursday after Autumn half-term'
    );
  });

  it('does not associate reopening with a remote historical holiday', () => {
    assert.equal(
      select([
        event(
          'holiday',
          'Summer holiday',
          'school.holiday',
          '2026-07-20',
          '2026-08-01'
        ),
        event(
          'reopen',
          'School reopens',
          'school.reopens',
          '2026-09-03',
          '2026-09-04'
        ),
      ])?.text,
      'School reopens Thursday'
    );
  });

  it('never infers reopening from a holiday exclusive end alone', () => {
    assert.equal(
      select([
        event(
          'holiday',
          'Autumn half-term',
          'school.holiday',
          '2026-08-24',
          '2026-08-30'
        ),
      ]),
      null
    );
  });

  it('does not treat an all-day exclusive end as an active Training Day', () => {
    assert.equal(
      select([
        event(
          'training',
          'Training Day',
          'school.training-day',
          '2026-08-29',
          '2026-08-30'
        ),
      ]),
      null
    );
  });

  it('deduplicates equivalent events from two School sources', () => {
    const insight = select([
      event(
        'training-curated',
        'Training Day',
        'school.training-day',
        '2026-08-30',
        '2026-08-31',
        { sourceId: 'school-curated' }
      ),
      event(
        'training-diary',
        'Training Day',
        'school.training-day',
        '2026-08-30',
        '2026-08-31',
        { sourceId: 'school-diary' }
      ),
    ]);

    assert.equal(
      insight?.text,
      'School closed today — Training Day'
    );
    assert.deepEqual(
      insight?.consumedEventIds.sort(),
      ['training-curated', 'training-diary']
    );
  });

  it('prefers a Training Day over an overlapping holiday transition', () => {
    const insight = select([
      event(
        'holiday',
        'Autumn half-term',
        'school.holiday',
        '2026-08-30',
        '2026-09-05'
      ),
      event(
        'training',
        'Training Day',
        'school.training-day',
        '2026-08-30',
        '2026-08-31'
      ),
    ]);

    assert.equal(
      insight?.text,
      'School closed today — Training Day'
    );
    assert.deepEqual(
      insight?.consumedEventIds.sort(),
      ['holiday', 'training']
    );
  });

  it('makes no assertion when reopening contradicts a closure on the same date', () => {
    assert.equal(
      select([
        event(
          'training',
          'Training Day',
          'school.training-day',
          '2026-08-30',
          '2026-08-31'
        ),
        event(
          'reopen',
          'School reopens',
          'school.reopens',
          '2026-08-30',
          '2026-08-31'
        ),
      ]),
      null
    );
  });

  it('returns at most one insight when several transitions are available', () => {
    const insight = select([
      event(
        'training-today',
        'Training Day',
        'school.training-day',
        '2026-08-30',
        '2026-08-31'
      ),
      event(
        'training-tomorrow',
        'Training Day',
        'school.training-day',
        '2026-08-31',
        '2026-09-01'
      ),
      event(
        'reopen',
        'School reopens',
        'school.reopens',
        '2026-09-02',
        '2026-09-03'
      ),
    ]);

    assert.deepEqual(insight, {
      text: 'School closed today — Training Day',
      consumedEventIds: ['training-today'],
    });
  });

  it('rolls tomorrow across a year boundary', () => {
    assert.equal(
      select(
        [
          event(
            'training',
            'Training Day',
            'school.training-day',
            '2027-01-01',
            '2027-01-02'
          ),
        ],
        new Date('2026-12-31T10:00:00.000Z')
      )?.text,
      'School closed tomorrow — Training Day'
    );
  });

  it('uses Household civil date when runtime UTC is on the prior date', () => {
    assert.equal(
      select(
        [
          event(
            'training',
            'Training Day',
            'school.training-day',
            '2026-08-31',
            '2026-09-01'
          ),
        ],
        new Date('2026-08-30T23:30:00.000Z')
      )?.text,
      'School closed today — Training Day'
    );
  });

  it('preserves Europe/London civil dates across the DST boundary', () => {
    assert.equal(
      select(
        [
          event(
            'training',
            'Training Day',
            'school.training-day',
            '2026-03-30',
            '2026-03-31'
          ),
        ],
        new Date('2026-03-29T23:30:00.000Z')
      )?.text,
      'School closed today — Training Day'
    );
  });
});
