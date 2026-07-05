function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function updateClock() {
  const now = window.eyClock.now();
  setText("status-time", now.timeShort);
  setText("status-date", now.date);
}

async function updateLiveData() {
  const weather = await window.eyWeatherService.getWeather();
  setText("weather-value", weather.value);
  setText("weather-detail", weather.detail);

  const rates = await window.eyCurrencyService.getRates();
  setText("gbp-mad-value", rates["GBP-MAD"].value);
  setText("gbp-mad-detail", rates["GBP-MAD"].detail);

  const prayer = await window.eyPrayerService.getNextPrayer();
  setText("prayer-value", prayer.value);
  setText("prayer-detail", prayer.detail);
}

function initDashboard() {
  setText("dashboard-title", window.dashboardConfig.title);
  setText("dashboard-subtitle", window.dashboardConfig.subtitle);

  window.eyWidgetRenderer.renderDashboard("dashboard-widgets", window.dashboardConfig);

  updateClock();
  updateLiveData();

  setInterval(updateClock, window.eyConfig.refresh.clockMs);
  setInterval(updateLiveData, window.eyConfig.refresh.weatherMs);
}

initDashboard();
