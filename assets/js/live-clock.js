window.eyClock = {
  now(config = window.eyConfig) {
    const now = new Date();

    return {
      time: now.toLocaleTimeString(config.locale, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: config.timezone
      }),
      timeShort: now.toLocaleTimeString(config.locale, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: config.timezone
      }),
      date: now.toLocaleDateString(config.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: config.timezone
      }),
      day: now.toLocaleDateString(config.locale, {
        weekday: "long",
        timeZone: config.timezone
      })
    };
  }
};
