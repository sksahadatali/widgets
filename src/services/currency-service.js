/**
 * eY Widgets
 * File    : currency-service.js
 * Purpose : Retrieve live exchange rates
 */

const CurrencyService = {
    previousRate: null,

    async getExchangeRate() {
        const config = dashboardConfig.currency;
        const url = `https://open.er-api.com/v6/latest/${config.from}`;

        try {
            const data = await ApiClient.get(url);
            const rate = data.rates[config.to];

            if (this.previousRate === null) {
                this.previousRate = this.getStoredRate();
            }

            const movementInfo = this.getMovement(rate);

            this.previousRate = rate;
            this.storeRate(rate);

            return {
                success: true,
                icon: "finance.currency",
                value: `${rate.toFixed(2)} ${movementInfo.symbol}`,
                detail: `${config.from} → ${config.to}`,
                meta: `Updated ${new Date().toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit"
                })}`,
                variant: movementInfo.variant
            };

        } catch (error) {
            Logger.error("Currency Service", error);

            return {
                success: false,
                icon: "finance.currency",
                value: "--.--",
                detail: "Unavailable",
                meta: "Update failed",
                variant: "danger"
            };
        }
    },

    getStoredRate() {
        const rate = localStorage.getItem("GBP_MAD_RATE");
        return rate ? parseFloat(rate) : null;
    },

    storeRate(rate) {
        localStorage.setItem("GBP_MAD_RATE", rate);
    },

    getMovement(currentRate) {
        if (this.previousRate === null) {
            return {
                symbol: "→",
                variant: ""
            };
        }

        if (currentRate > this.previousRate) {
            return {
                symbol: "↑",
                variant: "success"
            };
        }

        if (currentRate < this.previousRate) {
            return {
                symbol: "↓",
                variant: "danger"
            };
        }

        return {
            symbol: "→",
            variant: ""
        };
    }
};