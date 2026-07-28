import { Client } from '@notionhq/client';

import { env } from '../config/env.js';

const notion = new Client({
  auth: env.notion.token,
});

export type DueState =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'upcoming';

export type DueSoonTask = {
  id: string;
  task: string;
  type: string;
  area: string;
  priority: string;
  dueDate: string;
  dueLabel: string;
  dueState: DueState;
  status: string;
  link: string | null;
};

export type TaskItem = {
  id: string;
  task: string;
  type: string;
  area: string;
  priority: string;
  dueDate: string | null;
  dueLabel: string | null;
  dueState: DueState | null;
  status: string;
  link: string | null;
};

export type CreateTaskInput = {
  task: string;
  area: string;
  priority: string;
  dueDate: string | null;
};

export type UpdateTaskInput = {
  task: string;
  type: 'Task' | 'Reminder';
  area: string;
  priority: string;
  dueDate: string | null;
};

function getPlainText(property: any): string {
  if (property?.type === 'title') {
    return (
      property.title
        ?.map((item: any) => item.plain_text)
        .join('') ?? ''
    );
  }

  if (property?.type === 'rich_text') {
    return (
      property.rich_text
        ?.map((item: any) => item.plain_text)
        .join('') ?? ''
    );
  }

  return '';
}

function getSelect(property: any): string {
  if (property?.type === 'select') {
    return property.select?.name ?? '';
  }

  if (property?.type === 'status') {
    return property.status?.name ?? '';
  }

  return '';
}

function normaliseArea(area: string): string {
  switch (area.trim().toLowerCase()) {
    case 'raen':
      return 'RAEN';

    case 'ayanoh':
      return 'AYANOH';

    case 'family':
      return 'Family';

    case 'personal':
      return 'Personal';

    case 'daily':
      return 'Daily';

    case 'work':
      return 'Work';

    case 'home':
      return 'Home';

    case 'car':
      return 'Car';

    default:
      return area || 'General';
  }
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);

  return result;
}

function getDueInfo(
  dueDate: string
): {
  dueLabel: string;
  dueState: DueState;
} {
  const today = startOfDay(new Date());

  const due = startOfDay(
    new Date(`${dueDate}T00:00:00`)
  );

  const differenceMs =
    due.getTime() - today.getTime();

  const differenceDays =
    Math.round(
      differenceMs /
        (1000 * 60 * 60 * 24)
    );

  if (differenceDays < 0) {
    return {
      dueLabel: `Overdue · ${formatDueDate(due)}`,
      dueState: 'overdue',
    };
  }

  if (differenceDays === 0) {
    return {
      dueLabel: 'Today',
      dueState: 'today',
    };
  }

  if (differenceDays === 1) {
    return {
      dueLabel: 'Tomorrow',
      dueState: 'tomorrow',
    };
  }

  return {
    dueLabel: formatDueDate(due),
    dueState: 'upcoming',
  };
}


function formatDueDate(
  date: Date
): string {
  return date.toLocaleDateString(
    'en-GB',
    {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }
  );
}

/* -----------------------------------
   Due Soon / Reminders
----------------------------------- */

export async function getDueSoonTasks(): Promise<
  DueSoonTask[]
> {
  const response =
    await notion.dataSources.query({
      data_source_id:
        env.notion.tasksDataSourceId,

      filter: {
        and: [
          {
            property: 'Type',
            select: {
              equals: 'Reminder',
            },
          },
          {
            property: 'Status',
            status: {
              does_not_equal: 'Done',
            },
          },
          {
            property: 'Due Date',
            date: {
              is_not_empty: true,
            },
          },
        ],
      },

      sorts: [
        {
          property: 'Due Date',
          direction: 'ascending',
        },
      ],

      page_size: 50,
    });

  return response.results
    .filter(
      (
        page
      ): page is typeof page & {
        properties: Record<string, any>;
      } => 'properties' in page
    )
    .map((page) => {
      const properties =
        page.properties;

      const dueDate =
        properties['Due Date']?.type === 'date'
          ? properties['Due Date'].date?.start ?? null
          : null;

      if (!dueDate) {
        return null;
      }

      const {
        dueLabel,
        dueState,
      } = getDueInfo(dueDate);

      return {
        id: page.id,

        task:
          getPlainText(
            properties['Task']
          ) || 'Untitled reminder',

        type:
          getSelect(
            properties['Type']
          ) || 'Reminder',

        area:
          normaliseArea(
            getSelect(
              properties['Area']
            )
          ),

        priority:
          getSelect(
            properties['Priority']
          ) || 'Normal',

        dueDate,
        dueLabel,
        dueState,

        status:
          getSelect(
            properties['Status']
          ) || 'Not started',

        link:
          properties['Link']?.type === 'url'
            ? properties['Link'].url ?? null
            : null,
      };
    })
    .filter(
      (
        task
      ): task is DueSoonTask =>
        task !== null
    );
}

/* -----------------------------------
   Tasks
----------------------------------- */

export async function getTasks(): Promise<
  TaskItem[]
> {
  const response =
    await notion.dataSources.query({
      data_source_id:
        env.notion.tasksDataSourceId,

      filter: {
        and: [
          {
            property: 'Type',
            select: {
              equals: 'Task',
            },
          },
          {
            property: 'Status',
            status: {
              does_not_equal: 'Done',
            },
          },
        ],
      },

      sorts: [
        {
          property: 'Due Date',
          direction: 'ascending',
        },
      ],

      page_size: 100,
    });

  return response.results
    .filter(
      (
        page
      ): page is typeof page & {
        properties: Record<string, any>;
      } => 'properties' in page
    )
    .map((page) => {
      const properties =
        page.properties;

      const dueDate =
        properties['Due Date']?.type === 'date'
          ? properties['Due Date'].date?.start ?? null
          : null;

      const dueInfo =
        dueDate
          ? getDueInfo(dueDate)
          : null;

      return {
        id: page.id,

        task:
          getPlainText(
            properties['Task']
          ) || 'Untitled task',

        type:
          getSelect(
            properties['Type']
          ) || 'Task',

        area:
          normaliseArea(
            getSelect(
              properties['Area']
            )
          ),

        priority:
          getSelect(
            properties['Priority']
          ) || 'Normal',

        dueDate,

        dueLabel:
          dueInfo?.dueLabel ?? null,

        dueState:
          dueInfo?.dueState ?? null,

        status:
          getSelect(
            properties['Status']
          ) || 'Not started',

        link:
          properties['Link']?.type === 'url'
            ? properties['Link'].url ?? null
            : null,
      };
    });
}

export async function updateTaskStatus(
  pageId: string,
  status: string
): Promise<void> {
  await notion.pages.update({
    page_id: pageId,

    properties: {
      Status: {
        status: {
          name: status,
        },
      },
    },
  });
}

export async function createTask(
  input: CreateTaskInput
): Promise<string> {
  const properties: Record<string, any> = {
    Task: {
      title: [
        {
          text: {
            content: input.task,
          },
        },
      ],
    },

    Type: {
      select: {
        name: 'Task',
      },
    },

    Area: {
      select: {
        name: input.area,
      },
    },

    Priority: {
      select: {
        name: input.priority,
      },
    },

    Status: {
      status: {
        name: 'Not started',
      },
    },
  };

  if (input.dueDate) {
    properties['Due Date'] = {
      date: {
        start: input.dueDate,
      },
    };
  }

  const page = await notion.pages.create({
    parent: {
      data_source_id:
        env.notion.tasksDataSourceId,
    },

    properties,
  });

  return page.id;
}

export async function updateTask(
  pageId: string,
  input: UpdateTaskInput
): Promise<void> {
  const properties: Record<string, any> = {
    Task: {
      title: [
        {
          text: {
            content: input.task,
          },
        },
      ],
    },

    Type: {
      select: {
        name: input.type,
      },
    },

    Area: {
      select: {
        name: input.area,
      },
    },

    Priority: {
      select: {
        name: input.priority,
      },
    },
  };

  if (input.dueDate) {
    properties['Due Date'] = {
      date: {
        start: input.dueDate,
      },
    };
  } else {
    properties['Due Date'] = {
      date: null,
    };
  }

  await notion.pages.update({
    page_id: pageId,
    properties,
  });
}