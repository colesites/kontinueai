"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";
import { type FeedbackPostType } from "../types";

type FeedbackComposerProps = {
  title: string;
  details: string;
  type: FeedbackPostType;
  onTitleChange: (value: string) => void;
  onDetailsChange: (value: string) => void;
  onTypeChange: (value: FeedbackPostType) => void;
  onSubmit: () => void | Promise<void>;
};

export function FeedbackComposer({
  title,
  details,
  type,
  onTitleChange,
  onDetailsChange,
  onTypeChange,
  onSubmit,
}: FeedbackComposerProps) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm sm:p-5">
      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
        Create a Post
      </h2>
      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
        Share feature requests and bugs so others can vote and discuss.
      </p>

      <div className="mt-4 space-y-3">
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Post title"
          className="h-10 w-full rounded-xl border border-border/70 bg-background/70 px-3 text-sm outline-none ring-primary/40 focus:ring-2"
          maxLength={120}
        />
        <textarea
          value={details}
          onChange={(event) => onDetailsChange(event.target.value)}
          placeholder="Describe your idea or bug in detail..."
          className="min-h-28 w-full resize-y rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-sm outline-none ring-primary/40 focus:ring-2"
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={type}
            onValueChange={(value) => onTypeChange(value as FeedbackPostType)}
          >
            <SelectTrigger className="h-10 min-w-[168px] rounded-xl border-border/70 bg-background/70 text-sm focus-visible:ring-2 focus-visible:ring-primary/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border/70">
              <SelectItem value="feature">Feature Idea</SelectItem>
              <SelectItem value="bug">Bug Report</SelectItem>
              <SelectItem value="ui_ux">UI/UX</SelectItem>
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => void onSubmit()}
            className="h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Publish
          </button>
        </div>
      </div>
    </section>
  );
}
