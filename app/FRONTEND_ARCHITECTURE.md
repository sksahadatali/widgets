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

## components/common

Reusable UI elements.

Examples

- Button
- Badge
- Avatar
- Card
- Divider
- Icon

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