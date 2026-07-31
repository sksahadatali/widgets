import type {
    CalendarEvent,
  } from '../services/calendarService';
  
  import type {
    WeatherInsight,
  } from '../services/weatherIntelligence';
  
  export interface ContextInsight {
    id: string;
    title: string;
    score: number;
    reasons: string[];
    consumedWeatherInsightId: string;
  }
  
  function isValidDate(
    date: Date
  ): boolean {
    return !Number.isNaN(
      date.getTime()
    );
  }
  
  function getUpcomingEvent(
    events: CalendarEvent[],
    now: Date
  ): CalendarEvent | null {
    const upcomingEvents =
      events
        .filter(event => !event.allDay)
        .filter(event => {
          const start =
            new Date(event.start);
  
          return (
            isValidDate(start) &&
            start.getTime() >
              now.getTime()
          );
        })
        .sort(
          (first, second) =>
            new Date(
              first.start
            ).getTime() -
            new Date(
              second.start
            ).getTime()
        );
  
    return upcomingEvents[0] ?? null;
  }
  
  function formatEventTime(
    event: CalendarEvent
  ): string {
    const start =
      new Date(event.start);
  
    return new Intl.DateTimeFormat(
      'en-GB',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }
    ).format(start);
  }
  
  function isActionableWeather(
    insight: WeatherInsight
  ): boolean {
    return (
      insight.type !== 'comfort' &&
      insight.severity !== 'low'
    );
  }
  
  export function generateContextInsights(
    calendarEvents: CalendarEvent[],
    weatherInsights: WeatherInsight[],
    now: Date = new Date()
  ): ContextInsight[] {
    const event =
      getUpcomingEvent(
        calendarEvents,
        now
      );
  
    const weatherInsight =
      weatherInsights.find(
        isActionableWeather
      );
  
    if (
      !event ||
      !weatherInsight
    ) {
      return [];
    }
  
    const eventTime =
      formatEventTime(event);
  
    return [
      {
        id:
          `context-weather-calendar-` +
          `${event.id}`,
        title:
          `${weatherInsight.action} ` +
          `before ${event.title} ` +
          `at ${eventTime}.`,
        score:
          Math.max(
            weatherInsight.score + 15,
            100
          ),
        reasons: [
          'Upcoming calendar event',
          weatherInsight.title,
          'Cross-domain recommendation',
        ],
        consumedWeatherInsightId:
          weatherInsight.id,
      },
    ];
  }