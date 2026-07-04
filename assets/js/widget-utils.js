const EY = (() => {
  function params() {
    return new URLSearchParams(window.location.search);
  }

  function getParam(name, fallback = null) {
    return params().get(name) || fallback;
  }

  function applyTheme() {
    const theme = getParam('theme', 'dark');
    document.body.dataset.theme = theme;
  }

  function formatTime(date, showSeconds = false) {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: showSeconds ? '2-digit' : undefined,
      hour12: false
    });
  }

  function formatDate(date) {
    return date.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }

  return { getParam, applyTheme, formatTime, formatDate };
})();
