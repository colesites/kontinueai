import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Check every minute for task reminders that have crossed their fire time.
crons.interval(
  "dispatch task reminders",
  { minutes: 1 },
  internal.tasks.dispatchDueReminders,
  {},
);

export default crons;
