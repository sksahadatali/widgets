/**
 * Copy this file to config.local.js for a private local override.
 * config.local.js is ignored by Git and must never be committed.
 */

Object.assign(
  dashboardConfig.weather,
  {
    latitude: 51.5074,
    longitude: -0.1278,
    locationName: 'Example Town',
  }
);

Object.assign(
  dashboardConfig.prayer,
  {
    latitude: 51.5074,
    longitude: -0.1278,
    timezone: 'Europe/London',
  }
);

Object.assign(
  dashboardConfig.calendar,
  {
    endpoint: '',
  }
);

Object.assign(
  dashboardConfig.status,
  {
    location: 'Example Town, UK',
  }
);
