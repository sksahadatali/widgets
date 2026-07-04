EY.applyTheme();

const now = new Date();
document.getElementById('day').textContent = now.toLocaleDateString('en-GB', { weekday: 'long' });
document.getElementById('fullDate').textContent = now.toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});
