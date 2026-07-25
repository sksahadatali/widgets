# eY OS

> **A personal operating system that brings together the information that matters, simplifies everyday life, and helps make better decisions.**

---

# Vision

eY OS is a personal dashboard designed to become the single place for managing daily life, family, home, business and personal productivity.

Instead of switching between multiple apps, eY OS presents the information that matters most and helps users make better decisions.

### Core Principles

- **Inform** – Surface the right information at the right time.
- **Simplify** – Reduce complexity and context switching.
- **Decide** – Provide meaningful insights and recommendations.
- **Act** – Enable quick actions from one place.

---

# Current Features

## Live Services

- ✅ Weather
- ✅ Prayer Times
- ✅ Google Calendar
- ✅ GBP → MAD Exchange Rate
- ✅ Google Nest Thermostat

## Dashboard

- ✅ Home Dashboard
- ✅ Quick Status
- 🚧 Today's Brief
- 🚧 Today's Focus

---

# Technology Stack

## Frontend

- React
- TypeScript
- Vite
- Lucide React
- CSS Modules

## Backend

- Express
- TypeScript
- Google OAuth 2.0
- Google Smart Device Management API

## External APIs

- Open Meteo
- Google Calendar
- Google Nest SDM API
- Exchange Rate API

---

# Project Structure

```text
widgets/
│
├── app/                       # React application
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── pages/
│   │   └── styles/
│
├── server/                    # Express API
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── services/
│   │   └── server.ts
│
├── docs/
│
├── package.json               # Starts frontend & backend
├── start-ey-os.bat
│
└── README.md
```

---

# Getting Started

## Prerequisites

- Portable Node.js

Example location

```
C:\Users\n541568\Tools\node
```

---

## Installation

From the project root

```bash
npm install
```

---

## Running eY OS

Start both the frontend and backend

```bash
npm run dev
```

or simply run

```
start-ey-os.bat
```

The development server starts:

Frontend

```
http://localhost:5173
```

Backend

```
http://localhost:3001
```

Keep the terminal window open while developing.

---

# Environment Variables

## Frontend

Create

```
app/.env
```

```env
VITE_API_BASE_URL=http://localhost:3001
```

---

## Backend

Create

```
server/.env
```

```env
NEST_CLIENT_ID=
NEST_CLIENT_SECRET=
NEST_REFRESH_TOKEN=
NEST_PROJECT_ID=
NEST_DEVICE_NAME=
```

---

# Development Workflow

1. Run **start-ey-os.bat**
2. Keep the terminal window open
3. Edit React or Express code
4. Changes reload automatically
5. Close the terminal when finished

---

# Architecture

```
                    eY OS Dashboard
                           │
          ┌────────────────┴───────────────┐
          │                                │
     React Frontend                  Express API
          │                                │
          ├──────────────┬─────────────────┤
          │              │                 │
     Weather        Calendar         Nest API
          │              │                 │
          │         Google API      Google OAuth
          │                                │
      Open Meteo                    Google SDM
```

---

# Project Status

## ✅ Milestone 1 — Foundation

- Widget Framework
- Theme
- Service Layer
- API Client

---

## ✅ Milestone 2 — Live Integrations

- Weather
- Prayer Times
- Calendar
- Exchange Rate
- Nest Thermostat

---

## ✅ Milestone 3 — Backend

- Express Server
- Google OAuth
- Google SDM Integration
- REST API

---

## 🚧 Milestone 4 — Dashboard Intelligence

- Today's Brief
- AI Recommendations
- Smart Notifications
- Daily Priorities

---

## Planned

### Daily

- Gmail
- Shopping
- Travel
- News

### Personal

- Finance
- Health
- Family
- Faith

### RAEN

- Portfolio
- Pipeline
- Mortgages
- Tenants

### AYANOH

- Products
- Orders
- Inventory
- Suppliers

---

# Documentation

The following documents are available under the **docs/** folder.

- Vision
- PRD
- Roadmap
- Information Architecture
- User Flows
- Design Principles
- Feature Matrix
- Component Library
- Version History

---

# Development Principles

- React components remain presentational.
- Business logic lives in Hooks.
- External integrations live in Services.
- Backend abstracts third-party APIs from the frontend.
- Shared UI components are reused whenever possible.
- TypeScript is used throughout the project.

---

# Version

Current Version

**v0.3**

### Completed

- React Dashboard
- Live Quick Status
- Backend API
- Google Nest Integration

### Next

- AI-powered Today's Brief
- Task Integration
- Smart Recommendations