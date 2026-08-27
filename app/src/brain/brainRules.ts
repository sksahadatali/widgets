export const BrainRules = {
  PRIORITY: {
    HIGH: 80,
    MEDIUM: 55,
    LOW: 30,
  },

  STATUS: {
    IN_PROGRESS: 35,
    WAITING: -20,
  },

  DUE: {
    OVERDUE: 60,
    TODAY: 40,
    TOMORROW: 20,
    NEXT_HOUR: 35,
  },

  CONTEXT: {
    WORK_HOURS: 15,
    EVENING: 10,
    WEEKEND_RAEN: 10,
  },

  ROUTINE: {
    OVERDUE: 145,
    IN_PROGRESS: 135,
    DUE: 125,
    UPCOMING: 110,
    TODAY: 80,
    UPCOMING_HORIZON_MINUTES: 120,
    MAX_CANDIDATES: 3,
  },
} as const;
