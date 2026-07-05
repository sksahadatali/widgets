window.eyCurrencyService = {
  // Placeholder service.
  // Later we will connect this to a live FX API.
  async getRates() {
    return {
      "GBP-MAD": {
        value: "12.40",
        detail: "Placeholder · refresh hourly"
      },
      "GBP-INR": {
        value: "114.00",
        detail: "Placeholder · refresh hourly"
      }
    };
  }
};
