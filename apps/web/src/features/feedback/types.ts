import type { Id } from "@repo/convex/convex/_generated/dataModel";

export type FeedbackPostType = "feature" | "bug" | "ui_ux";

export type FeedbackComment = {
  id: Id<"feedbackComments">;
  parentId?: Id<"feedbackComments">;
  body: string;
  createdAt: number;
  authorName: string;
  authorImage?: string;
  isCommunityManager?: boolean;
};

export type FeedbackPost = {
  id: Id<"feedbackPosts">;
  title: string;
  details: string;
  type: FeedbackPostType;
  score: number;
  commentCount?: number;
  isOwner: boolean;
  createdAt: number;
  comments: FeedbackComment[];
};
