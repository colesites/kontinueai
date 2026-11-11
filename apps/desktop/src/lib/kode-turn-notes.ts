// Notes Kode adds to a reply when a turn ends early.

import type { KodeTodo } from "./kode-tools";

/** The reply of a turn that failed part-way: what it wrote, why it stopped,
 *  and where in its plan, so you can tell it to continue. */
export function interruptedReply(partial: string, reason: string, todos: KodeTodo[]): string {
  const open = todos.filter((todo) => todo.status !== "completed" && todo.status !== "cancelled");
  const current = todos.find((todo) => todo.status === "in_progress") ?? open[0];
  const where = current
    ? ` It was working on "${current.title}"${open.length > 1 ? `, with ${open.length - 1} more step${open.length === 2 ? "" : "s"} after it` : ""}.`
    : "";
  const note = `> **This turn stopped before finishing.** ${reason.trim() || "The model connection failed."}${where} Send *continue* to pick up from there.`;
  return partial.trim() ? `${partial.trim()}

${note}` : note;
}
