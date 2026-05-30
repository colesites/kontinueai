import type { Id } from "@repo/convex/convex/_generated/dataModel";

export type SidebarChat = {
  _id: Id<"chats">;
  title: string;
  projectId?: Id<"projects"> | null;
  pinnedAt?: number;
  source?: {
    provider?: string | null;
  } | null;
};
