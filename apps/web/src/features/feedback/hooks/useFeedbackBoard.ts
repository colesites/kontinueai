"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { type FeedbackPost, type FeedbackPostType } from "../types";

type FeedbackFormState = {
  title: string;
  details: string;
  type: FeedbackPostType;
};

const INITIAL_FORM: FeedbackFormState = {
  title: "",
  details: "",
  type: "feature",
};

export function useFeedbackBoard() {
  const posts = useQuery(api.feedback.listPosts, {});
  const createPostMutation = useMutation(api.feedback.createPost);
  const updatePostMutation = useMutation(api.feedback.updatePost);
  const deletePostMutation = useMutation(api.feedback.deletePost);
  const votePostMutation = useMutation(api.feedback.votePost);
  const addCommentMutation = useMutation(api.feedback.addComment);
  const [form, setForm] = useState<FeedbackFormState>(INITIAL_FORM);

  const boardPosts = useMemo(() => (posts ?? []) as FeedbackPost[], [posts]);

  const topPosts = useMemo(
    () =>
      [...boardPosts].sort((a, b) =>
        b.score === a.score ? b.createdAt - a.createdAt : b.score - a.score,
      ),
    [boardPosts],
  );

  const newPosts = useMemo(
    () => [...boardPosts].sort((a, b) => b.createdAt - a.createdAt),
    [boardPosts],
  );

  const updateForm = (next: Partial<FeedbackFormState>) => {
    setForm((previous) => ({ ...previous, ...next }));
  };

  const createPost = async () => {
    const title = form.title.trim();
    const details = form.details.trim();
    if (!title || !details) return false;

    try {
      await createPostMutation({
        title,
        details,
        type: form.type,
      });
      setForm(INITIAL_FORM);
      return true;
    } catch {
      return false;
    }
  };

  const votePost = async (
    postId: Id<"feedbackPosts">,
    direction: "up" | "down",
  ) => {
    try {
      await votePostMutation({ postId, direction });
    } catch {
      toast.error("Could not register vote. Please sign in and try again.");
    }
  };

  const addComment = async (postId: Id<"feedbackPosts">, body: string, parentId?: Id<"feedbackComments">) => {
    const trimmed = body.trim();
    if (!trimmed) return false;

    try {
      await addCommentMutation({ postId, body: trimmed, parentId });
      return true;
    } catch {
      return false;
    }
  };

  const editPost = async (
    postId: Id<"feedbackPosts">,
    title: string,
    details: string,
    type: FeedbackPostType,
  ) => {
    try {
      await updatePostMutation({ postId, title, details, type });
      return true;
    } catch {
      toast.error("Could not edit post. Please sign in and try again.");
      return false;
    }
  };

  const deletePost = async (postId: Id<"feedbackPosts">) => {
    try {
      await deletePostMutation({ postId });
      return true;
    } catch {
      toast.error("Could not delete post. Please sign in and try again.");
      return false;
    }
  };

  return {
    form,
    isLoading: posts === undefined,
    topPosts,
    newPosts,
    updateForm,
    createPost,
    votePost,
    addComment,
    editPost,
    deletePost,
  };
}
