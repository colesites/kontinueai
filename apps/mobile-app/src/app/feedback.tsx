import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  ArrowLeft,
  BadgeCheck,
  Bug,
  ChevronDown,
  ChevronUp,
  Flame,
  Lightbulb,
  Pencil,
  MessageCircle,
  Palette,
  Plus,
  Reply,
  SendHorizontal,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react-native";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/app-errors";
import { cn } from "@/lib/utils";

type FeedbackType = "feature" | "bug" | "ui_ux";
type FeedbackSort = "top" | "new";

// Theme tones, not hand-picked hex: web renders these icons from tokens too.
const TYPES: {
  value: FeedbackType;
  label: string;
  icon: typeof Lightbulb;
  tone: string;
}[] = [
  { value: "feature", label: "Feature", icon: Lightbulb, tone: "text-primary" },
  { value: "bug", label: "Bug", icon: Bug, tone: "text-destructive" },
  { value: "ui_ux", label: "UI / UX", icon: Palette, tone: "text-muted-foreground" },
];

// Same nesting cap as web FeedbackPostModal.
const MAX_DEPTH = 3;

type FeedbackComment = {
  id: Id<"feedbackComments">;
  parentId?: Id<"feedbackComments">;
  body: string;
  createdAt: number;
  authorName: string;
  authorImage?: string;
  isCommunityManager?: boolean;
};

function formatRelativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function FeedbackScreen() {
  const router = useRouter();
  const { mutedForeground, primaryForeground } = useTheme();
  const posts = useQuery(api.feedback.listPosts, { limit: 100 });
  const createPost = useMutation(api.feedback.createPost);
  const votePost = useMutation(api.feedback.votePost);
  const addComment = useMutation(api.feedback.addComment);
  const deletePost = useMutation(api.feedback.deletePost);
  const updatePost = useMutation(api.feedback.updatePost);

  const [sort, setSort] = useState<FeedbackSort>("top");
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<{
    id: Id<"feedbackPosts">;
    title: string;
    details: string;
    type: FeedbackType;
  } | null>(null);
  const [expandedPost, setExpandedPost] = useState<Id<"feedbackPosts"> | null>(
    null,
  );
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [replyTo, setReplyTo] = useState<FeedbackComment | null>(null);
  // Captured once (React Compiler forbids Date.now() during render).
  const [now] = useState(() => Date.now());

  const filtered = useMemo(() => {
    const next = [...(posts ?? [])];
    return next.sort((a, b) =>
      sort === "top" ? b.score - a.score : b.createdAt - a.createdAt,
    );
  }, [posts, sort]);

  const submitComment = async (postId: Id<"feedbackPosts">) => {
    const body = comment.trim();
    if (!body || commenting) return;
    setCommenting(true);
    try {
      await addComment({ postId, body, parentId: replyTo?.id });
      setComment("");
      setReplyTo(null);
    } catch (error) {
      toast.error(replyTo ? "Couldn't post reply" : "Couldn't add comment", {
        description: errorMessage(error, "Please try again."),
      });
    } finally {
      setCommenting(false);
    }
  };

  const removePost = (postId: Id<"feedbackPosts">, title: string) => {
    Alert.alert("Delete feedback?", `“${title}” will be removed.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deletePost({ postId })
            .then(() => toast.success("Feedback deleted"))
            .catch((error) =>
              toast.error("Couldn't delete feedback", {
                description: errorMessage(error, "Please try again."),
              }),
            );
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <View className="mb-4 flex-row items-center justify-between gap-3 px-4 pt-3">
        <Pressable
          onPress={() => router.replace("/")}
          className="min-h-11 flex-row items-center gap-2 rounded-full border border-foreground/8 bg-foreground/4 px-3.5 active:bg-foreground/8"
        >
          <Icon as={ArrowLeft} size={16} className="text-muted-foreground" />
          <Text className="text-[13px] font-medium text-muted-foreground">Back to Kontinue AI</Text>
        </Pressable>
        <View className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5">
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-primary">Feedback Beta</Text>
        </View>
      </View>

      <View className="relative mx-4 overflow-hidden rounded-3xl border border-foreground/8 bg-card p-5">
        <View className="absolute -right-8 -top-12 h-32 w-32 rounded-full bg-primary/15" />
        <Text className="text-[10.5px] font-semibold uppercase tracking-[2.5px] text-primary">Community</Text>
        <Text className="mt-2 text-[25px] font-semibold tracking-tight text-foreground">Feedback Board</Text>
        <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
          Post feature ideas, bug reports, or UI/UX feedback, vote on what matters most, and discuss with the community.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setComposerOpen(true)}
          className="mt-4 min-h-11 self-start flex-row items-center gap-2 rounded-full bg-primary px-4 active:opacity-90"
        >
          <Icon as={Plus} size={16} className="text-primary-foreground" />
          <Text className="text-[13px] font-semibold text-primary-foreground">Post feedback</Text>
        </Pressable>
      </View>

      <View className="mx-4 mt-5 flex-row items-center gap-1 rounded-xl border border-foreground/6 bg-foreground/4 p-1">
        <SortTab
          icon={Flame}
          label="Top"
          selected={sort === "top"}
          onPress={() => setSort("top")}
        />
        <SortTab
          icon={Sparkles}
          label="New"
          selected={sort === "new"}
          onPress={() => setSort("new")}
        />
      </View>
      <Text className="mx-4 mb-3 mt-2 text-[11px] text-muted-foreground">
        {sort === "top" ? "Sorted by highest vote score." : "Sorted by most recent posts."}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="gap-3 px-4 pb-12"
        showsVerticalScrollIndicator={false}
      >
        {posts === undefined ? (
          <View className="gap-3">
            {[1, 2, 3].map((item) => (
              <View key={item} className="h-32 rounded-2xl bg-foreground/5" />
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-foreground/15 px-5 py-12">
            <Icon
              as={MessageCircle}
              size={22}
              className="text-muted-foreground"
            />
            <Text className="mt-3 text-center text-[13px] text-muted-foreground">
              No feedback in this category yet.
            </Text>
          </View>
        ) : (
          filtered.map((post) => {
            const type =
              TYPES.find((item) => item.value === post.type) ?? TYPES[0]!;
            const expanded = expandedPost === post.id;
            return (
              <View
                key={post.id}
                className="rounded-[20px] border border-foreground/8 bg-card p-3.5"
              >
                <View className="flex-row items-start gap-3">
                  <View className="items-center rounded-full border border-foreground/6 bg-foreground/4 p-1">
                    <VoteButton
                      icon={ChevronUp}
                      label="Upvote"
                      onPress={() =>
                        void votePost({ postId: post.id, direction: "up" })
                      }
                    />
                    <Text className="min-w-8 text-center text-[13px] font-semibold text-foreground">
                      {post.score}
                    </Text>
                    <VoteButton
                      icon={ChevronDown}
                      label="Downvote"
                      onPress={() =>
                        void votePost({ postId: post.id, direction: "down" })
                      }
                    />
                  </View>

                  <View className="min-w-0 flex-1">
                    <View className="flex-row items-center gap-2">
                      <View className="flex-row items-center gap-1.5 rounded-full border border-foreground/6 bg-foreground/4 px-2 py-1">
                        <Icon as={type.icon} size={11} className={type.tone} />
                        <Text className="text-[10.5px] font-medium text-muted-foreground">
                          {type.label}
                        </Text>
                      </View>
                      <Text className="text-[10.5px] text-muted-foreground">
                        {new Date(post.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text className="mt-2 text-[15px] font-semibold leading-5 text-foreground">
                      {post.title}
                    </Text>
                    <Text className="mt-1.5 text-[12.5px] leading-5 text-muted-foreground">
                      {post.details}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row items-center border-t border-foreground/6 pt-2">
                  <Pressable
                    onPress={() => {
                      setExpandedPost(expanded ? null : post.id);
                      setReplyTo(null);
                      setComment("");
                    }}
                    className="min-h-11 flex-row items-center gap-2 rounded-xl px-2 active:bg-accent"
                  >
                    <Icon
                      as={MessageCircle}
                      size={15}
                      className="text-muted-foreground"
                    />
                    <Text className="text-[12px] font-medium text-muted-foreground">
                      {post.commentCount}{" "}
                      {post.commentCount === 1 ? "comment" : "comments"}
                    </Text>
                  </Pressable>
                  <View className="flex-1" />
                  {post.isOwner ? (
                    <View className="flex-row">
                      <Pressable
                        accessibilityLabel="Edit feedback"
                        onPress={() =>
                          setEditingPost({
                            id: post.id,
                            title: post.title,
                            details: post.details,
                            type: post.type as FeedbackType,
                          })
                        }
                        className="h-11 w-11 items-center justify-center rounded-xl active:bg-accent"
                      >
                        <Icon as={Pencil} size={15} className="text-muted-foreground" />
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Delete feedback"
                        onPress={() => removePost(post.id, post.title)}
                        className="h-11 w-11 items-center justify-center rounded-xl active:bg-destructive/10"
                      >
                        <Icon
                          as={Trash2}
                          size={15}
                          className="text-muted-foreground"
                        />
                      </Pressable>
                    </View>
                  ) : null}
                </View>

                {expanded ? (
                  <View className="gap-3 border-t border-foreground/6 pt-3">
                    {post.comments.length === 0 ? (
                      <Text className="text-[12px] text-muted-foreground">
                        Start the conversation.
                      </Text>
                    ) : (
                      <View>
                        {post.comments
                          .filter(
                            (entry) =>
                              !entry.parentId ||
                              !post.comments.some((c) => c.id === entry.parentId),
                          )
                          .map((entry) => (
                            <CommentThread
                              key={entry.id}
                              comment={entry}
                              allComments={post.comments}
                              depth={0}
                              now={now}
                              onReply={(target) => setReplyTo(target)}
                            />
                          ))}
                      </View>
                    )}
                    {replyTo ? (
                      <View className="flex-row items-center gap-2 self-start rounded-full border border-primary/20 bg-primary/10 py-1 pl-3 pr-1">
                        <Icon as={Reply} size={12} className="text-primary" />
                        <Text numberOfLines={1} className="max-w-56 text-[11.5px] font-medium text-primary">
                          Replying to {replyTo.authorName}
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Cancel reply"
                          hitSlop={8}
                          onPress={() => setReplyTo(null)}
                          className="h-6 w-6 items-center justify-center rounded-full active:bg-primary/15"
                        >
                          <Icon as={X} size={12} className="text-primary" />
                        </Pressable>
                      </View>
                    ) : null}
                    <View className="min-h-12 flex-row items-end gap-2 rounded-2xl border border-foreground/5 bg-foreground/4 p-1.5 pl-3">
                      <TextInput
                        value={comment}
                        onChangeText={setComment}
                        multiline
                        maxLength={500}
                        placeholder={
                          replyTo ? `Reply to ${replyTo.authorName}` : "Add a comment"
                        }
                        placeholderTextColor={mutedForeground}
                        className="max-h-24 min-h-9 flex-1 py-2 text-[13px] text-foreground"
                      />
                      <Pressable
                        disabled={!comment.trim() || commenting}
                        onPress={() => void submitComment(post.id)}
                        className={cn(
                          "h-10 w-10 items-center justify-center rounded-full",
                          comment.trim() && !commenting
                            ? "bg-primary"
                            : "bg-primary/35",
                        )}
                      >
                        {commenting ? (
                          <ActivityIndicator size="small" color={primaryForeground} />
                        ) : (
                          <Icon
                            as={SendHorizontal}
                            size={15}
                            className="text-primary-foreground"
                          />
                        )}
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>

      <FeedbackComposer
        key={editingPost?.id ?? "create"}
        visible={composerOpen || editingPost !== null}
        initialValue={editingPost}
        onClose={() => {
          setComposerOpen(false);
          setEditingPost(null);
        }}
        onSubmit={async (input) => {
          if (editingPost) {
            await updatePost({ postId: editingPost.id, ...input });
          } else {
            await createPost(input);
          }
          setComposerOpen(false);
          setEditingPost(null);
        }}
      />
    </SafeAreaView>
  );
}

function SortTab({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: typeof Flame;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        "min-h-10 flex-1 flex-row items-center justify-center gap-1.5 rounded-lg px-4",
        selected
          ? "bg-primary"
          : "active:bg-foreground/5",
      )}
    >
      <Icon as={icon} size={14} className={selected ? "text-primary-foreground" : "text-muted-foreground"} />
      <Text
        className={cn(
          "text-[12.5px] font-medium",
          selected ? "text-primary-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VoteButton({
  icon,
  label,
  onPress,
}: {
  icon: typeof ChevronUp;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      className="h-10 w-10 items-center justify-center rounded-full active:bg-primary/10"
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}

function FeedbackComposer({
  visible,
  initialValue,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  initialValue: {
    title: string;
    details: string;
    type: FeedbackType;
  } | null;
  onClose: () => void;
  onSubmit: (input: {
    title: string;
    details: string;
    type: FeedbackType;
  }) => Promise<void>;
}) {
  const { mutedForeground, primaryForeground } = useTheme();
  const [title, setTitle] = useState(initialValue?.title ?? "");
  const [details, setDetails] = useState(initialValue?.details ?? "");
  const [type, setType] = useState<FeedbackType>(
    initialValue?.type ?? "feature",
  );
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !details.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit({ title: title.trim(), details: details.trim(), type });
      setTitle("");
      setDetails("");
      setType("feature");
    } catch (error) {
      toast.error(
        initialValue ? "Couldn't update feedback" : "Couldn't post feedback",
        { description: errorMessage(error, "Please try again.") },
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end bg-black/55"
      >
        <View className="rounded-t-[28px] border-t border-foreground/10 bg-popover px-5 pb-10 pt-3">
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full bg-foreground/15" />
          </View>
          <View className="mb-5 flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                Feedback
              </Text>
              <Text className="mt-1 text-[20px] font-semibold text-foreground">
                {initialValue ? "Edit your post" : "Share an idea"}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              className="h-9 w-9 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5"
            >
              <Icon as={X} size={18} className="text-muted-foreground" />
            </Pressable>
          </View>

          <View className="mb-4 flex-row gap-2">
            {TYPES.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setType(option.value)}
                className={cn(
                  "min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border",
                  type === option.value
                    ? "border-primary/40 bg-primary/10"
                    : "border-foreground/8 bg-foreground/4",
                )}
              >
                <Icon as={option.icon} size={13} className={option.tone} />
                <Text className="text-[11.5px] font-medium text-foreground">
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            placeholder="Short title"
            placeholderTextColor={mutedForeground}
            className="min-h-12 rounded-xl border border-foreground/5 bg-foreground/4 px-3.5 text-[14px] text-foreground"
          />
          <TextInput
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={2000}
            placeholder="What should change, and why?"
            placeholderTextColor={mutedForeground}
            textAlignVertical="top"
            className="mt-3 min-h-28 rounded-xl border border-foreground/5 bg-foreground/4 px-3.5 py-3 text-[14px] leading-5 text-foreground"
          />
          <Pressable
            disabled={!title.trim() || !details.trim() || saving}
            onPress={() => void submit()}
            className={cn(
              "mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-xl",
              title.trim() && details.trim() && !saving
                ? "bg-primary"
                : "bg-primary/35",
            )}
          >
            {saving ? (
              <ActivityIndicator size="small" color={primaryForeground} />
            ) : (
              <Icon
                as={SendHorizontal}
                size={16}
                className="text-primary-foreground"
              />
            )}
            <Text className="text-[13.5px] font-semibold text-primary-foreground">
              {saving
                ? initialValue
                  ? "Saving…"
                  : "Posting…"
                : initialValue
                  ? "Save changes"
                  : "Post feedback"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Web CommentThread: avatar, author, team badge, reply, nested replies. */
function CommentThread({
  comment,
  allComments,
  depth,
  now,
  onReply,
}: {
  comment: FeedbackComment;
  allComments: FeedbackComment[];
  depth: number;
  now: number;
  onReply: (comment: FeedbackComment) => void;
}) {
  const children = allComments.filter((c) => c.parentId === comment.id);
  const avatar = depth === 0 ? 28 : 22;
  return (
    <View className={depth === 0 ? "py-2" : "pt-2.5"}>
      <View className="flex-row gap-2.5">
        <View
          className="items-center justify-center overflow-hidden rounded-full bg-muted"
          style={{ width: avatar, height: avatar }}
        >
          {comment.authorImage ? (
            <Image
              source={{ uri: comment.authorImage }}
              style={{ width: avatar, height: avatar, borderRadius: avatar / 2 }}
            />
          ) : (
            <Icon as={User} size={depth === 0 ? 14 : 11} className="text-muted-foreground" />
          )}
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <Text className="text-[12px] font-semibold text-foreground">
              {comment.authorName}
            </Text>
            {comment.isCommunityManager ? (
              <View className="flex-row items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5">
                <Icon as={BadgeCheck} size={10} className="text-primary" />
                <Text className="text-[9.5px] font-bold text-primary">Community Manager</Text>
              </View>
            ) : null}
            <Text className="text-[10.5px] text-muted-foreground">
              · {formatRelativeTime(comment.createdAt, now)}
            </Text>
          </View>
          <Text selectable className="mt-0.5 text-[12.5px] leading-[19px] text-muted-foreground">
            {comment.body}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reply to ${comment.authorName}`}
            onPress={() => onReply(comment)}
            hitSlop={8}
            className="mt-1 flex-row items-center gap-1 self-start py-1"
          >
            <Icon as={Reply} size={11} className="text-muted-foreground/70" />
            <Text className="text-[10.5px] font-semibold text-muted-foreground/70">Reply</Text>
          </Pressable>
        </View>
      </View>
      {children.length > 0 ? (
        // Past MAX_DEPTH replies stay at the same indent, like web, so deep
        // threads don't squeeze into a sliver on a phone.
        <View
          className={
            depth < MAX_DEPTH ? "ml-3.5 mt-0.5 border-l-2 border-muted-foreground/15 pl-3" : ""
          }
        >
          {children.map((child) => (
            <CommentThread
              key={child.id}
              comment={child}
              allComments={allComments}
              depth={Math.min(depth + 1, MAX_DEPTH)}
              now={now}
              onReply={onReply}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
