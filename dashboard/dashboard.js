/**
 * eY Widgets
 * File    : dashboard.js
 * Purpose : Render dashboard widgets and live status bar
 */

/**
 * Apply dashboard theme from config.js.
 */
function applyTheme() {
    document.body.className = "";
    document.body.classList.add(`theme-${dashboardConfig.theme}`);
}

/**
 * Render widgets from dashboardConfig.
 */
function renderWidgets() {
    const widgetStrip = document.getElementById("widget-strip");

    widgetStrip.innerHTML = dashboardConfig.widgets
        .map(widget => {
            const valueClass = widget.variant === "success"
                ? "widget-value success"
                : "widget-value";

            return `
                <section class="widget-card" id="${widget.id}">
                    <div class="widget-icon">${widget.icon}</div>
                    <div class="widget-content">
                        <div class="widget-title">${widget.title}</div>
                        <div class="${valueClass}">${widget.value}</div>
                        <div class="widget-detail">${widget.detail}</div>
                    </div>
                </section>
            `;
        })
        .join("");
}

/**
 * Update time, date and status bar values.
 */
function updateStatusBar() {
    const now = new Date();

    document.getElementById("status-time").textContent =
        now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit"
        });

    document.getElementById("status-date").textContent =
        now.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        });

    document.getElementById("status-message").textContent =
        dashboardConfig.status.message;

    document.getElementById("status-location").textContent =
        dashboardConfig.status.location;
}

/**
 * Initialise dashboard.
 */
function initDashboard() {
    applyTheme();

    document.getElementById("dashboard-title").textContent = dashboardConfig.title;
    document.getElementById("dashboard-subtitle").textContent = dashboardConfig.subtitle;

    renderWidgets();
    updateStatusBar();

    setInterval(updateStatusBar, 1000);
}

initDashboard();