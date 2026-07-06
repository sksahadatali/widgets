/**
 * ==========================================================
 * eY Widgets
 * File      : theme-manager.js
 * Module    : Theme Manager
 * Purpose   : Apply dashboard theme
 * Author    : Sahadat Ali
 * ==========================================================
 */

const ThemeManager = {

    /**
     * Apply the selected theme.
     */
    applyTheme() {

        const selectedTheme = dashboardConfig.theme || "dark";

        // Remove all previous theme classes
        document.body.className = "";

        // Apply the selected theme
        document.body.classList.add(`theme-${selectedTheme}`);

        Logger.debug("Theme applied", selectedTheme);

    }

};