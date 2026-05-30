"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { api } from "@repo/convex/convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/ui/dialog";
import { Input } from "@repo/ui/components/ui/input";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { Button } from "@repo/ui/components/ui/button";
import { PRIORITY_META, type Task } from "../lib/task-shared";
import { DateTimePicker } from "./DateTimePicker";
import { ReminderField } from "./ReminderField";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export function TaskEditDialog({
  task,
  open,
  onOpenChange,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updateTask = useMutation(api.tasks.updateTask);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState<number | null>(null);
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [reminder, setReminder] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Hydrate form whenever a new task is opened.
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDescription(task.description ?? "");
    setDueDate(task.dueDate ?? null);
    setPriority(task.priority);
    setReminder(task.reminderMinutesBefore ?? null);
  }, [task]);

  // Dropping the due date invalidates any reminder.
  useEffect(() => {
    if (dueDate == null && reminder != null) setReminder(null);
  }, [dueDate, reminder]);

  if (!task) return null;

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      toast.error("Title can't be empty");
      return;
    }
    setSaving(true);
    try {
      await updateTask({
        taskId: task._id,
        title: trimmed,
        description: description.trim() || undefined,
        dueDate: dueDate ?? null,
        priority,
        reminderMinutesBefore: dueDate != null ? (reminder ?? null) : null,
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save task");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            maxLength={200}
            autoFocus
          />
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            maxLength={2000}
            rows={3}
          />

          <div className="flex flex-wrap items-center gap-2">
            <DateTimePicker value={dueDate} onChange={setDueDate} />
            <div className="relative">
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as Task["priority"])
                }
                aria-label="Priority"
                className="h-9 rounded-md border border-input bg-transparent px-2.5 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_META[p].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ReminderField
            dueDate={dueDate}
            value={reminder}
            onChange={setReminder}
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
