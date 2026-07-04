function updateClock() {
  const now = new Date();

  const time = now.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  const seconds = now.toLocaleTimeString('en-GB', {
    second: '2-digit'
  });

  const date = now.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  document.getElementById('time').textContent = time;
  document.getElementById('seconds').textContent = seconds;
  document.getElementById('date').textContent = date;
}

updateClock();
setInterval(updateClock, 1000);
