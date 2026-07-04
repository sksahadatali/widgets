EY.applyTheme();

const showSeconds = EY.getParam('seconds', 'false') === 'true';
const timeEl = document.getElementById('time');
const dateEl = document.getElementById('date');

function updateClock() {
  const now = new Date();
  timeEl.textContent = EY.formatTime(now, showSeconds);
  dateEl.textContent = EY.formatDate(now);
}

updateClock();
setInterval(updateClock, 1000);
