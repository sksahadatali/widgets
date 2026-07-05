# Architecture

``` text
Dashboard
    │
    ▼
Widget Renderer
    │
    ▼
Widget Components
    │
    ▼
Configuration
    │
    ▼
Services
    │
    ▼
External APIs
```

## Responsibilities

### Dashboard

Responsible only for layout.

### Widget Renderer

Creates widgets from configuration.

### Widget

Displays information only.

### Services

Retrieve and transform data.

### APIs

-   Weather
-   Currency
-   Prayer
-   Calendar
-   News

**Widgets should never call APIs directly.**
