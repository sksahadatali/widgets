/**
 * eY Widgets
 * File    : status-bar.js
 * Purpose : Updates dashboard status bar
 */

const StatusBar = {
    /**
     * Update time, date, message and location.
     */
    update() {
        const now = new Date();

        this.setText("status-time", now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit"
        }));

        this.setText("status-date", now.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }));

        this.setText("status-message", dashboardConfig.status.message);
        this.setText("status-location", dashboardConfig.status.location);
    },

    /**
     * Safely set text content for an element.
     */
    setText(elementId, value) {
        const element = document.getElementById(elementId);

        if (!element) {
            Logger.warn(`Status element not found: ${elementId}`);
            return;
        }

        element.textContent = value;
    },

    /**
     * Start live status updates.
     */
    start() {
        this.update();

        setInterval(() => {
            this.update();
        }, 1000);

        Logger.debug("Status bar started");
    }
};