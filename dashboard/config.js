/**
 * eY Widgets
 * File    : config.js
 * Purpose : Central dashboard configuration
 */

const dashboardConfig = {
    debug: true,
	theme: "dark", // Options: dark, light, medium, navy, coffee, transparent, glass,oled

    title: "Home Command Centre",
    subtitle: "Family • Property • Business • Finance • Focus",

    widgets: [
        { id: "weather", icon: "weather.sun", title: "Weather", value: "24°C", detail: "Partly Cloudy" },
        { id: "next-event", icon: "calendar.event", title: "Next Event", value: "Kumon - Rehan", detail: "5:30 PM Today" },
        { id: "property-alert", icon: "property.house", title: "Property Alert", value: "2 New Listings", detail: "Liverpool", variant: "success" },
        { id: "ayanoh", icon: "business.shop", title: "AYANOH", value: "Supplier Quote", detail: "Due Tomorrow" },
        { id: "currency", icon: "finance.currency", title: "GBP / MAD", value: "12.45 ↑", detail: "Updated 10:30 AM" },
        { id: "prayer", icon: "prayer.mosque", title: "Next Prayer", value: "Loading...", detail: "Fetching prayer time", meta: "" }
    ],

    weather: {
    latitude: 51.9172,
    longitude: -0.6603,
    locationName: "Leighton Buzzard",
    refreshMinutes: 30
	},
	
    prayer: {
        latitude: 51.9172,
        longitude: -0.6603,
        method: 2, // ISNA for now. We can adjust later.
        school: 1, // Hanafi Asr calculation
        timezone: "Europe/London",
        refreshMinutes: 60
    },

	status: {
        message: "Tie your camel and trust in Allah.",
        location: "Leighton Buzzard, UK"
    }
};