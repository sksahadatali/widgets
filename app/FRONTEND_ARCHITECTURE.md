# eY OS Frontend Architecture

Version: 1.0
Status: Active

---

# Purpose

The React application is the presentation layer of eY OS.

It is responsible for rendering the user interface and interacting with the shared services, widgets and APIs.

The frontend should remain lightweight, reusable and easy to maintain.

---

# Frontend Principles

1. Canva is the design source of truth.

2. Product specifications drive implementation.

3. React implements the approved design.
It never becomes the design tool.

4. Components should be reusable.

5. Business logic belongs outside UI components whenever possible.

6. Build small components with one responsibility.

7. Prefer composition over duplication.

8. Keep folders organised by responsibility.


---

# Architecture Decisions 

## ADR-001 – React Application Location
Status: Approved

Decision:
The React application resides under the `app/` folder.

Reason:
eY OS is the overall product, while the React application is only the presentation layer.

---

## ADR-002 – Component Folder Structure
Status: Approved

Decision:
Each component has its own folder containing its implementation and styles.

Example:

Sidebar/
├── Sidebar.tsx
└── Sidebar.css

Reason:
Improves scalability and keeps related files together.

---

## ADR-003 – UI Components
Status: Approved

Decision:
Reusable visual components are stored under:

components/ui

Reason:
The name "ui" clearly represents reusable interface building blocks.

---

## ADR-004 – Design Source of Truth
Status: Approved

Decision:
Canva is the authoritative design source.

Reason:
React implements the approved design rather than becoming the design tool.

---

## ADR-005 – CSS Ownership
Status: Approved

Decision:
Each component owns its own CSS file.

Global styles remain in:

styles/

Reason:
Improves maintainability and reduces coupling.

---

# Folder Structure

app/

    public/

    src/

        assets/
        components/
            common/
            layout/
            modules/

        hooks/

        pages/

        styles/

        types/

        App.tsx

        main.tsx

---

# Folder Responsibilities

## assets

Images, icons and fonts used by the frontend.

---

## components/layout

Application layout components.

Examples

- Sidebar
- Header
- PageContainer
- MainContent

---

## components/modules

Dashboard modules.

Examples

- TodaysBrief
- TodaysFocus
- QuickStatus
- DueSoon
- Tasks
- BusinessOverview
- TopNews

---

## components/ui

Reusable UI building blocks shared across the application.

Examples

- Avatar
- SearchBox
- IconButton
- Badge
- Card
- Divider

---

## hooks

Reusable React hooks.

---

## pages

Application pages.

Examples

- Home
- Settings
- Personal
- RAEN
- AYANOH

---

## styles

Global styles and theme variables.

---

## types

Shared TypeScript interfaces and types.

---

# Naming Convention

React Components

PascalCase

Examples

Sidebar.tsx

Header.tsx

TodaysBrief.tsx

BusinessOverview.tsx

---

Functions

camelCase

Example

loadDashboard()

---

Constants

UPPER_SNAKE_CASE

Example

DEFAULT_THEME

---

# Development Workflow

Product Specification

↓

Canva Design

↓

React Component

↓

Browser

↓

Live Data

↓

AI

---

# Definition of Done

A feature is complete when:

✓ Matches Canva

✓ Responsive

✓ Uses shared components

✓ Code reviewed

✓ Git committed

✓ Documentation updated

---

End of document

# Version History

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | Jul 2026 | Initial frontend architecture |
| 1.1 | Jul 2026 | Introduced Architecture Decisions (ADR), component-per-folder standard, renamed `common` to `ui` |