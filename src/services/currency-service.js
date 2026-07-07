/**
 * eY Widgets
 * File    : currency-service.js
 * Purpose : Retrieve live exchange rates
 */

const CurrencyService = {

    async getExchangeRate() {

        const config = dashboardConfig.currency;

        const url =
            `https://open.er-api.com/v6/latest/${config.from}`;

        try {

            const data = await ApiClient.get(url);

            const rate = data.rates[config.to];

            return {
                success: true,
                icon: "finance.currency",
                value: rate.toFixed(2),
                detail: `${config.from} → ${config.to}`,
                meta: `Updated ${new Date().toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit"
                })}`
            };

        } catch (error) {

            Logger.error("Currency Service", error);

            return {
                success: false,
                icon: "finance.currency",
                value: "--.--",
                detail: "Unavailable",
                meta: ""
            };
        }

    }

};