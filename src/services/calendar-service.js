const CalendarService = {
    async getNextEvent() {
        try {
            const data = await ApiClient.get(dashboardConfig.calendar.endpoint);

            return {
                success: true,
                icon: "calendar.event",
                value: data.title,
                detail: data.time || "No time",
                meta: data.meta || ""
            };
        } catch (error) {
            Logger.error("Calendar Service", error);

            return {
                success: false,
                icon: "calendar.event",
                value: "Unavailable",
                detail: "Calendar error",
                meta: ""
            };
        }
    }
};