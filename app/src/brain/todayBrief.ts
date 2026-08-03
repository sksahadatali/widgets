
  import type {
    BrainInput,
    BriefItem,
  } from './types';
  
  function isValidDate(
    date: Date
  ): boolean {
    return !Number.isNaN(
      date.getTime()
    );
  }
  
  function formatTime(
    date: Date
  ): string {
    return new Intl.DateTimeFormat(
      'en-GB',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }
    ).format(date);
  }
  
  export function generateTodayBrief(
    input: BrainInput,
    now: Date = new Date()
  ): BriefItem[] {
  
    const items: BriefItem[] = [];
  
    const upcomingEvent =
      input.calendarEvents
        .filter(event => !event.allDay)
        .filter(event => {
          const start =
            new Date(event.start);
  
          return (
            isValidDate(start) &&
            start > now
          );
        })
        .sort(
          (first, second) =>
            new Date(first.start).getTime() -
            new Date(second.start).getTime()
        )[0];
  
    if (upcomingEvent) {
      const start =
        new Date(upcomingEvent.start);
  
      items.push({
        id: `calendar-${upcomingEvent.id}`,
  
        title: upcomingEvent.title,
  
        description:
          `Starts at ${formatTime(start)}.`,
  
        priority: 'medium',
  
        source: 'calendar',
  
        score: 80,
      });
    }
  
    return items
      .sort(
        (a, b) => b.score - a.score
      )
      .slice(0, 5);
  }