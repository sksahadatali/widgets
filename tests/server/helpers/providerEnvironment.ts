// Synthetic process configuration required before importing the Express app.
for (const key of ['NEST_CLIENT_ID', 'NEST_CLIENT_SECRET', 'NEST_REFRESH_TOKEN', 'NEST_PROJECT_ID', 'NEST_DEVICE_NAME', 'NOTION_TOKEN', 'NOTION_TASKS_DATA_SOURCE_ID']) {
  process.env[key] ??= 'synthetic-test';
}
