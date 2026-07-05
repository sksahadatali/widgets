window.eyApiClient = {
  async getJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { "Accept": "application/json" },
      ...options
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    return response.json();
  }
};
