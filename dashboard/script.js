function updateTimeStatus() {
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  dashboardConfig.status[0] = { icon: '◷', strong: time, text: '' };
  renderStatus(dashboardConfig.status);
}

document.getElementById('dashboardTitle').textContent = dashboardConfig.title;
document.getElementById('dashboardSubtitle').textContent = dashboardConfig.subtitle;
renderWidgets(dashboardConfig.widgets);
updateTimeStatus();
setInterval(updateTimeStatus, 1000);
