# eY Widgets

Reusable HTML, CSS and JavaScript widgets for Notion, GitHub Pages and home dashboards.

## Live URLs

After publishing with GitHub Pages:

- Clock: `https://sksahadatali.github.io/widgets/clock/`
- Date: `https://sksahadatali.github.io/widgets/date/`
- Dashboard: `https://sksahadatali.github.io/widgets/dashboard/`

## URL configuration

Clock examples:

- `clock/?theme=dark`
- `clock/?theme=light`
- `clock/?theme=flat`
- `clock/?seconds=true`

Date examples:

- `date/?theme=dark`
- `date/?theme=light`
- `date/?theme=flat`

## Structure

```text
assets/
  css/theme.css
  js/widget-utils.js
clock/
  index.html
  script.js
date/
  index.html
  script.js
dashboard/
  index.html
```

## GitHub Pages

Repository settings:

- Source: Deploy from a branch
- Branch: main
- Folder: / root

Then embed individual widget URLs into Notion using `/embed`.
