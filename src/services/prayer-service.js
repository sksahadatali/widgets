/**
 * eY Widgets
 * File    : prayer-service.js
 * Purpose : Fetch prayer times and calculate the next prayer
 */

const PrayerService = {
    async getNextPrayer() {
        const config = dashboardConfig.prayer;

        const url =
            `https://api.aladhan.com/v1/timings` +
            `?latitude=${config.latitude}` +
            `&longitude=${config.longitude}` +
            `&method=${config.method}` +
            `&school=${config.school}`;

        try {
            Logger.debug("Fetching prayer times", url);

            const data = await ApiClient.get(url);
            
            const timings = data.data.timings;

            return this.findNextPrayer(timings);

        } catch (error) {
            Logger.error("Prayer service failed", error);

            return {
                success: false,
                name: "Unavailable",
                time: "--:--",
                meta: "Prayer update failed",
                icon: "prayer.mosque"
            };
        }
    },

    findNextPrayer(timings) {
        const prayers = [
            { name: "Fajr", time: timings.Fajr },
            { name: "Dhuhr", time: timings.Dhuhr },
            { name: "Asr", time: timings.Asr },
            { name: "Maghrib", time: timings.Maghrib },
            { name: "Isha", time: timings.Isha }
        ];

        const now = new Date();

        for (const prayer of prayers) {
            const prayerTime = this.parsePrayerTime(prayer.time);

            if (prayerTime > now) {
                return {
                    success: true,
                    name: prayer.name,
                    time: this.formatTime(prayer.time),
                    meta: this.getTimeRemaining(prayerTime),
                    icon: this.getPrayerIcon(prayer.name)
                };
            }
        }

        const fajrTomorrow = this.parsePrayerTime(timings.Fajr);
        fajrTomorrow.setDate(fajrTomorrow.getDate() + 1);

        return {
            success: true,
            name: "Fajr",
            time: this.formatTime(timings.Fajr),
            meta: "Tomorrow",
            icon: this.getPrayerIcon("Fajr")
        };
    },

    parsePrayerTime(timeText) {
        const cleanTime = timeText.split(" ")[0];
        const [hours, minutes] = cleanTime.split(":").map(Number);

        const date = new Date();
        date.setHours(hours, minutes, 0, 0);

        return date;
    },

    formatTime(timeText) {
        return timeText.split(" ")[0];
    },

    getTimeRemaining(prayerTime) {
        const now = new Date();
        const diffMs = prayerTime - now;

        const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) {
            return `In ${hours}h ${minutes}m`;
        }

        return `In ${minutes}m`;
    },

    getPrayerIcon(prayerName) {
        const icons = {
            Fajr: "prayer.fajr",
            Dhuhr: "prayer.dhuhr",
            Asr: "prayer.asr",
            Maghrib: "prayer.maghrib",
            Isha: "prayer.isha"
        };

        return icons[prayerName] || "prayer.mosque";
    }
};