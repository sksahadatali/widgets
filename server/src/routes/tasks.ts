import { Router } from 'express';

import {
  createTask,
  getDueSoonTasks,
  getTasks,
  updateTask,
  updateTaskStatus,
} from '../services/notionService.js';

const router = Router();

/* -----------------------------------
   Tasks
----------------------------------- */

router.get('/', async (_request, response) => {
  try {
    const tasks = await getTasks();

    response.json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    console.error(
      'Unable to load tasks:',
      error
    );

    response.status(500).json({
      success: false,
      error: 'Unable to load tasks',
    });
  }
});

router.post(
  '/',
  async (request, response) => {
    try {
      const {
        task,
        type,
        area,
        priority,
        dueDate,
      } = request.body as {
        task?: string;
        type?: 'Task' | 'Reminder';
        area?: string;
        priority?: string;
        dueDate?: string | null;
      };

      if (!task?.trim()) {
        response.status(400).json({
          success: false,
          error: 'Task name is required',
        });

        return;
      }

      if (type !== 'Task' && type !== 'Reminder') {
        response.status(400).json({
          success: false,
          error: 'Valid Type is required',
        });
      
        return;
      }

      if (!area?.trim()) {
        response.status(400).json({
          success: false,
          error: 'Area is required',
        });

        return;
      }

      const id = await createTask({
        task: task.trim(),
        type,
        area: area.trim(),
        priority:
          priority?.trim() ||
          'Medium',
        dueDate: dueDate || null,
      });

      response.status(201).json({
        success: true,
        id,
      });
    } catch (error) {
      console.error(
        'Unable to create task:',
        error
      );

      response.status(500).json({
        success: false,
        error: 'Unable to create task',
      });
    }
  }
);

/* -----------------------------------
   Due Soon / Reminders
----------------------------------- */

router.get(
  '/due-soon',
  async (_request, response) => {
    try {
      const tasks =
        await getDueSoonTasks();

      response.json({
        success: true,
        count: tasks.length,
        tasks,
      });
    } catch (error) {
      console.error(
        'Unable to load Due Soon tasks:',
        error
      );

      response.status(500).json({
        success: false,
        error:
          'Unable to load Due Soon tasks',
      });
    }
  }
);

/* -----------------------------------
   Update Status
----------------------------------- */

router.patch(
  '/:id',
  async (request, response) => {
    try {
      const { id } = request.params;

      const {
        task,
        type,
        area,
        priority,
        dueDate,
      } = request.body as {
        task?: string;
        type?: 'Task' | 'Reminder';
        area?: string;
        priority?: string;
        dueDate?: string | null;
      };

      if (!task?.trim()) {
        response.status(400).json({
          success: false,
          error: 'Task name is required',
        });

        return;
      }

      if (
        type !== 'Task' &&
        type !== 'Reminder'
      ) {
        response.status(400).json({
          success: false,
          error: 'Valid Type is required',
        });

        return;
      }

      if (!area?.trim()) {
        response.status(400).json({
          success: false,
          error: 'Area is required',
        });

        return;
      }

      await updateTask(id, {
        task: task.trim(),
        type,
        area: area.trim(),
        priority:
          priority?.trim() || 'Medium',
        dueDate: dueDate || null,
      });

      response.json({
        success: true,
      });
    } catch (error) {
      console.error(
        'Unable to update task:',
        error
      );

      response.status(500).json({
        success: false,
        error: 'Unable to update task',
      });
    }
  }
);

router.patch(
  '/:id/status',
  async (request, response) => {
    try {
      const { id } = request.params;
      const { status } = request.body as {
        status?: string;
      };

      if (!status) {
        response.status(400).json({
          success: false,
          error: 'Status is required',
        });

        return;
      }

      await updateTaskStatus(
        id,
        status
      );

      response.json({
        success: true,
      });
    } catch (error) {
      console.error(
        'Unable to update task:',
        error
      );

      response.status(500).json({
        success: false,
        error: 'Unable to update task',
      });
    }
  }
);

export default router;