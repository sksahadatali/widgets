function renderIcon(name) {
  return eyIcons[name] || eyIcons.calendar;
}

function renderWidgets(widgets) {
  const grid = document.getElementById('widgetGrid');
  grid.innerHTML = widgets.map(w => `
    <article class="ey-widget">
      <div class="ey-icon">${renderIcon(w.icon)}</div>
      <div>
        <div class="ey-label">${w.title}</div>
        <div class="ey-value ${w.tone || ''}">${w.value}</div>
        <div class="ey-detail">${w.detail || ''}</div>
      </div>
    </article>
  `).join('');
}

function renderStatus(items) {
  const status = document.getElementById('statusBar');
  status.innerHTML = items.map(i => `
    <span class="ey-status-item">${i.icon || ''} ${i.strong ? `<strong>${i.strong}</strong>` : ''} ${i.text || ''}</span>
  `).join('');
}
