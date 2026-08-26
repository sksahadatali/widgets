/**
 * eY Widgets
 * File    : config.js
 * Purpose : Public/demo dashboard configuration
 *
 * Private household overrides belong in config.local.js.
 */

const dashboardConfig = {
    debug: true,
    theme: "dark",

    title: "Home Command Centre",
    subtitle: "Family • Property • Business • Finance • Focus",

    widgets: [
        { id: "weather", icon: "weather.sun", title: "Weather", value: "24°C", detail: "Partly Cloudy" },
        { id: "next-event", icon: "calendar.event", title: "Next Event", value: "Example Event", detail: "5:30 PM Today" },
        { id: "property-alert", icon: "property.house", title: "Property Alert", value: "2 New Listings", detail: "Example Area", variant: "success" },
        { id: "ayanoh", icon: "business.shop", title: "AYANOH", value: "Supplier Quote", detail: "Due Tomorrow" },
        { id: "currency", icon: "finance.currency", title: "GBP / MAD", value: "12.45 ↑", detail: "Updated 10:30 AM" },
        { id: "prayer", icon: "prayer.mosque", title: "Next Prayer", value: "Loading...", detail: "Fetching prayer time", meta: "" }
    ],

    weather: {
        latitude: 51.5074,
        longitude: -0.1278,
        locationName: "Example Town",
        refreshMinutes: 30
    },

    prayer: {
        latitude: 51.5074,
        longitude: -0.1278,
        method: 2,
        school: 1,
        timezone: "Europe/London",
        refreshMinutes: 60
    },

    currency: {
        from: "GBP",
        to: "MAD",
        refreshMinutes: 60
    },

    calendar: {
        endpoint: "",
        refreshMinutes: 15
    },

    status: {
        message: "Tie your camel and trust in Allah.",
        location: "Example Town, UK"
    }
};
