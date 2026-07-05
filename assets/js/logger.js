/**
 * eY Widgets
 * File    : logger.js
 * Purpose : Central debug logger
 */

const Logger = {
    /**
     * Write debug logs only when debug mode is enabled.
     */
    debug(message, data = null) {
        if (!dashboardConfig?.debug) return;

        if (data) {
            console.log(`[DEBUG] ${message}`, data);
        } else {
            console.log(`[DEBUG] ${message}`);
        }
    },

    /**
     * Write warning logs.
     */
    warn(message, data = null) {
        if (data) {
            console.warn(`[WARN] ${message}`, data);
        } else {
            console.warn(`[WARN] ${message}`);
        }
    },

    /**
     * Write error logs.
     */
    error(message, error = null) {
        if (error) {
            console.error(`[ERROR] ${message}`, error);
        } else {
            console.error(`[ERROR] ${message}`);
        }
    }
};