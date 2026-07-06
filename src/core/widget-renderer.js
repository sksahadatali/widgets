/**
 * eY Widgets
 * File    : widget-renderer.js
 * Purpose : Renders dashboard widgets from configuration
 */

const WidgetRenderer = {
    /**
     * Render all widgets into the widget strip.
     */
    renderWidgets() {
        const widgetStrip = document.getElementById("widget-strip");

        if (!widgetStrip) {
            Logger.warn("Widget strip container not found");
            return;
        }

        widgetStrip.innerHTML = dashboardConfig.widgets
            .map(widget => this.renderWidget(widget))
            .join("");

        Logger.debug("Widgets rendered", dashboardConfig.widgets);
    },

    /**
     * Render a single widget card.
     */
    renderWidget(widget) {
        const valueClass = widget.variant === "success"
            ? "widget-value success"
            : "widget-value";

        return `
            <section class="widget-card" id="${widget.id}">
                <div class="widget-icon">
                    ${IconManager.get(widget.icon)}
                </div>

                <div class="widget-content">
                    <div class="widget-title">${widget.title}</div>
                    <div class="${valueClass}">${widget.value}</div>
                    <div class="widget-detail">${widget.detail}</div>
                </div>
            </section>
        `;
    }
};