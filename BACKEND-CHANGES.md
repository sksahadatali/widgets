# Required backend change

The POST /api/tasks endpoint must accept `type` from the request body.

```ts
const { task, type, area, priority, dueDate } = req.body;

if (!task || !['Task', 'Reminder'].includes(type)) {
  return res.status(400).json({ success: false, message: 'Invalid task payload' });
}

await createTask({ task, type, area, priority, dueDate: dueDate || null });
```

In the Notion create call, replace any hardcoded Task value with:

```ts
Type: {
  select: {
    name: input.type,
  },
},
```
