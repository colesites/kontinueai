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

// Kode remote control: expire commands a computer never picked up and drop
// finished ones (kodeRemote.ts).
crons.interval(
  "clean up kode remote commands",
  { minutes: 5 },
  internal.kodeRemote.cleanup,
  {},
);

export default crons;
