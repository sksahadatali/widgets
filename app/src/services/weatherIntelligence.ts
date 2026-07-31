import type {
    WeatherData,
  } from './weatherService';
  
  export type WeatherInsightSeverity =
    | 'high'
    | 'medium'
    | 'low';
  
  export type WeatherInsightType =
    | 'rain'
    | 'storm'
    | 'snow'
    | 'heat'
    | 'cold'
    | 'comfort';
  
  export type WeatherInsight = {
    id: string;
    type: WeatherInsightType;
    severity: WeatherInsightSeverity;
    title: string;
    message: string;
    action: string;
    score: number;
  };
  
  const RAIN_CODES = [
    51,
    53,
    55,
    61,
    63,
    65,
    80,
    81,
  ];
  
  const HEAVY_RAIN_CODES = [
    55,
    65,
    81,
  ];
  
  const SNOW_CODES = [
    71,
    73,
    75,
  ];
  
  const THUNDERSTORM_CODES = [
    95,
    96,
    99,
  ];
  
  function getRainInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    if (
      !RAIN_CODES.includes(
        weather.weatherCode
      )
    ) {
      return null;
    }
  
    const heavyRain =
      HEAVY_RAIN_CODES.includes(
        weather.weatherCode
      );
  
    if (heavyRain) {
      return {
        id: 'weather-heavy-rain',
        type: 'rain',
        severity: 'high',
        title: 'Heavy rain expected',
        message:
          `${weather.condition} is expected in ` +
          `${weather.location}.`,
        action:
          'Carry an umbrella and allow extra travel time.',
        score: 95,
      };
    }
  
    return {
      id: 'weather-rain',
      type: 'rain',
      severity: 'medium',
      title: 'Rain expected',
      message:
        `${weather.condition} is expected in ` +
        `${weather.location}.`,
      action:
        'Take an umbrella before leaving home.',
      score: 85,
    };
  }
  
  function getStormInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    if (
      !THUNDERSTORM_CODES.includes(
        weather.weatherCode
      )
    ) {
      return null;
    }
  
    return {
      id: 'weather-thunderstorm',
      type: 'storm',
      severity: 'high',
      title: 'Thunderstorm risk',
      message:
        `Thunderstorms are expected around ` +
        `${weather.location}.`,
      action:
        'Avoid unnecessary outdoor activity and secure loose garden items.',
      score: 100,
    };
  }
  
  function getSnowInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    if (
      !SNOW_CODES.includes(
        weather.weatherCode
      )
    ) {
      return null;
    }
  
    const heavySnow =
      weather.weatherCode === 75;
  
    return {
      id: heavySnow
        ? 'weather-heavy-snow'
        : 'weather-snow',
      type: 'snow',
      severity: heavySnow
        ? 'high'
        : 'medium',
      title: heavySnow
        ? 'Heavy snow expected'
        : 'Snow expected',
      message:
        `${weather.condition} is expected in ` +
        `${weather.location}.`,
      action:
        'Check travel conditions and allow extra journey time.',
      score: heavySnow
        ? 100
        : 90,
    };
  }
  
  function getHeatInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    if (weather.high >= 30) {
      return {
        id: 'weather-extreme-heat',
        type: 'heat',
        severity: 'high',
        title: 'Very hot day expected',
        message:
          `Temperatures may reach ` +
          `${weather.high}°C in ` +
          `${weather.location}.`,
        action:
          'Stay hydrated, keep rooms shaded and avoid strenuous activity during the hottest part of the day.',
        score: 95,
      };
    }
  
    if (weather.high >= 26) {
      return {
        id: 'weather-hot',
        type: 'heat',
        severity: 'medium',
        title: 'Hot afternoon expected',
        message:
          `The temperature may reach ` +
          `${weather.high}°C.`,
        action:
          'Stay hydrated and keep the home shaded where possible.',
        score: 75,
      };
    }
  
    return null;
  }
  
  function getColdInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    if (weather.low <= 0) {
      return {
        id: 'weather-freezing',
        type: 'cold',
        severity: 'high',
        title: 'Freezing conditions expected',
        message:
          `Temperatures may fall to ` +
          `${weather.low}°C.`,
        action:
          'Dress warmly and check for icy conditions before travelling.',
        score: 95,
      };
    }
  
    if (
      weather.low <= 5 ||
      weather.feelsLike <= 5
    ) {
      return {
        id: 'weather-cold',
        type: 'cold',
        severity: 'medium',
        title: 'Cold conditions expected',
        message:
          `It may feel as cold as ` +
          `${weather.feelsLike}°C.`,
        action:
          'Wear a warm jacket when leaving home.',
        score: 70,
      };
    }
  
    return null;
  }
  
  function getComfortInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    const comfortableHigh =
      weather.high >= 15 &&
      weather.high <= 24;
  
    const comfortableLow =
      weather.low >= 8;
  
    const dryWeather =
      !RAIN_CODES.includes(
        weather.weatherCode
      ) &&
      !SNOW_CODES.includes(
        weather.weatherCode
      ) &&
      !THUNDERSTORM_CODES.includes(
        weather.weatherCode
      );
  
    if (
      comfortableHigh &&
      comfortableLow &&
      dryWeather
    ) {
      return {
        id: 'weather-comfortable',
        type: 'comfort',
        severity: 'low',
        title: 'Comfortable weather today',
        message:
          `${weather.condition}, with a high of ` +
          `${weather.high}°C.`,
        action:
          'Conditions should be suitable for normal outdoor plans.',
        score: 20,
      };
    }
  
    return null;
  }
  
  function removeDuplicateInsights(
    insights: WeatherInsight[]
  ): WeatherInsight[] {
    const uniqueInsights =
      new Map<
        string,
        WeatherInsight
      >();
  
    insights.forEach(insight => {
      const existing =
        uniqueInsights.get(
          insight.type
        );
  
      if (
        !existing ||
        insight.score >
          existing.score
      ) {
        uniqueInsights.set(
          insight.type,
          insight
        );
      }
    });
  
    return Array.from(
      uniqueInsights.values()
    );
  }
  
  export function generateWeatherInsights(
    weather: WeatherData
  ): WeatherInsight[] {
    const possibleInsights = [
      getStormInsight(weather),
      getSnowInsight(weather),
      getRainInsight(weather),
      getHeatInsight(weather),
      getColdInsight(weather),
      getComfortInsight(weather),
    ];
  
    return removeDuplicateInsights(
      possibleInsights.filter(
        (
          insight
        ): insight is WeatherInsight =>
          insight !== null
      )
    ).sort(
      (first, second) =>
        second.score -
        first.score
    );
  }
  
  export function getPrimaryWeatherInsight(
    weather: WeatherData
  ): WeatherInsight | null {
    return (
      generateWeatherInsights(
        weather
      )[0] ?? null
    );
  }