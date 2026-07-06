/**
 * eY Widgets
 * File    : api-client.js
 * Purpose : Shared API client for all external service calls
 */

const ApiClient = {
    async get(url, options = {}) {
        const timeoutMs = options.timeoutMs || 10000;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            Logger.debug("API GET", url);

            const response = await fetch(url, {
                method: "GET",
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            clearTimeout(timeoutId);
            Logger.error("API request failed", error);
            throw error;
        }
    }
};