import type { Metadata } from "next";
import { TasksClient } from "../../../features/tasks/components/TasksClient";

export const metadata: Metadata = {
  title: "Kontinue AI - Tasks",
};

export default function TasksPage() {
  return <TasksClient />;
}
