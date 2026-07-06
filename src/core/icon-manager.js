/**
 * ==========================================================
 * eY Widgets
 * File      : icon-manager.js
 * Module    : Icon Manager
 * Purpose   : Central icon registry for the application
 * ==========================================================
 */

const IconManager = {

    /**
     * Return an icon for a given name.
     * Future versions will load Lucide SVG icons.
     */
    get(iconName) {

        const icons = {

			"weather.sun": "☀️",
			"weather.partlyCloudy": "⛅",
			"weather.cloud": "☁️",
			"weather.fog": "🌫️",
			"weather.rain": "🌧️",
			"weather.snow": "❄️",
			"weather.thunderstorm": "⛈️",
			"weather.unknown": "❓",

            "calendar.event": "📅",

            "property.house": "🏠",

            "business.shop": "🛍️",

            "finance.currency": "💷",

            "prayer.mosque": "🕌",
            "prayer.fajr": "🌅",
            "prayer.dhuhr": "☀️",
            "prayer.asr": "🌤️",
            "prayer.maghrib": "🌇",
            "prayer.isha": "🌙"

        };

        return icons[iconName] || "❓";
    }

};