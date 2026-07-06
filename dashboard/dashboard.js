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
                    <div class="widget-icon">${IconManager.get(widget.icon)}</div>
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
    ErrorHandler.safeRun("Initialise Dashboard", function () {
        ThemeManager.applyTheme();

        document.getElementById("dashboard-title").textContent = dashboardConfig.title;
        document.getElementById("dashboard-subtitle").textContent = dashboardConfig.subtitle;

        WidgetRenderer.renderWidgets();
        StatusBar.start();

        updateWeatherWidget();

        setInterval(
            updateWeatherWidget,
            dashboardConfig.weather.refreshMinutes * 60 * 1000
        );

        Logger.debug("Dashboard version", AppVersion);
    });
}

async function updateWeatherWidget() {
    const weatherWidget = dashboardConfig.widgets.find(widget => widget.id === "weather");

    if (!weatherWidget) {
        Logger.warn("Weather widget not found in config");
        return;
    }

    weatherWidget.value = "Loading...";
    weatherWidget.detail = "Fetching weather";
    WidgetRenderer.renderWidgets();

    const weather = await WeatherService.getCurrentWeather();

    weatherWidget.icon = weather.icon;

    if (weather.success) {
        weatherWidget.value = `${weather.temperature}°C`;
        weatherWidget.detail = weather.condition;
        weatherWidget.meta = `Updated ${weather.updatedAt}`;
    } else {
        weatherWidget.value = "Unavailable";
        weatherWidget.detail = "Update failed";
        weatherWidget.meta = "";
    }

    WidgetRenderer.renderWidgets();
}

initDashboard();