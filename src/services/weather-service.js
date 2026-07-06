/**
 * eY Widgets
 * File    : weather-service.js
 * Purpose : Fetch current weather from Open-Meteo
 */

const WeatherService = {
    async getCurrentWeather() {
        const config = dashboardConfig.weather;

        const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${config.latitude}` +
            `&longitude=${config.longitude}` +
            `&current=temperature_2m,apparent_temperature,weather_code` +
            `&timezone=Europe%2FLondon`;

        try {
            Logger.debug("Fetching weather", url);

            const data = await ApiClient.get(url);
            const weatherCode = data.current.weather_code;

            return {
				success: true,
				temperature: Math.round(data.current.temperature_2m),
				feelsLike: Math.round(data.current.apparent_temperature),
				condition: this.getCondition(weatherCode),
				icon: this.getIcon(weatherCode),
				updatedAt: new Date().toLocaleTimeString("en-GB", {
					hour: "2-digit",
					minute: "2-digit"
				})
			};

        } catch (error) {
            Logger.error("Weather service failed", error);

            return {
                success: false,
                temperature: "--",
                feelsLike: "--",
                condition: "Unavailable",
                icon: "weather.unknown",
                updatedAt: "Failed"
            };
        }
    },

    getCondition(code) {
        const conditions = {
            0: "Clear",
            1: "Mostly Clear",
            2: "Partly Cloudy",
            3: "Cloudy",
            45: "Fog",
            48: "Freezing Fog",
            51: "Light Drizzle",
            53: "Drizzle",
            55: "Heavy Drizzle",
            61: "Light Rain",
            63: "Rain",
            65: "Heavy Rain",
            71: "Light Snow",
            73: "Snow",
            75: "Heavy Snow",
            80: "Rain Showers",
            81: "Heavy Showers",
            95: "Thunderstorm"
        };

        return conditions[code] || "Unknown";
    },

    getIcon(code) {
        if ([0, 1].includes(code)) return "weather.sun";
        if ([2].includes(code)) return "weather.partlyCloudy";
        if ([3].includes(code)) return "weather.cloud";
        if ([45, 48].includes(code)) return "weather.fog";
        if ([51, 53, 55, 61, 63, 65, 80, 81].includes(code)) return "weather.rain";
        if ([71, 73, 75].includes(code)) return "weather.snow";
        if ([95].includes(code)) return "weather.thunderstorm";

        return "weather.unknown";
    }
};