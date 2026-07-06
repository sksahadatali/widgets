/**
 * eY Widgets
 * File    : error-handler.js
 * Purpose : Central error handling
 */

const ErrorHandler = {
    /**
     * Run a function safely and catch errors.
     */
    safeRun(label, callback) {
        try {
            Logger.debug(`Starting: ${label}`);

            callback();

            Logger.debug(`Completed: ${label}`);
        } catch (error) {
            Logger.error(`Failed: ${label}`, error);
        }
    }
};