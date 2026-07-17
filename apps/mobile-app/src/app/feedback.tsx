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
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import {
  ArrowLeft,
  Bug,
  ChevronDown,
  ChevronUp,
  Flame,
  Lightbulb,
  Pencil,
  MessageCircle,
  Palette,
  Plus,
  SendHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react-native";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type FeedbackType = "feature" | "bug" | "ui_ux";
type FeedbackSort = "top" | "new";

const TYPES: {
  value: FeedbackType;
  label: string;
  icon: typeof Lightbulb;
  color: string;
}[] = [
  { value: "feature", label: "Feature", icon: Lightbulb, color: "#eab308" },
  { value: "bug", label: "Bug", icon: Bug, color: "#ef4444" },
  { value: "ui_ux", label: "UI / UX", icon: Palette, color: "#a855f7" },
];

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
      await addComment({ postId, body });
      setComment("");
    } catch (error) {
      Alert.alert(
        "Couldn't add comment",
        error instanceof Error ? error.message : "Please try again.",
      );
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
          void deletePost({ postId }).catch(() =>
            Alert.alert("Couldn't delete feedback", "Please try again."),
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
          <View className="items-center rounded-2xl border border-dashed border-border px-5 py-12">
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
                className="rounded-2xl border border-border bg-card p-3.5"
              >
                <View className="flex-row items-start gap-3">
                  <View className="items-center rounded-xl border border-border bg-secondary p-1">
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
                      <View className="flex-row items-center gap-1.5 rounded-full bg-secondary px-2 py-1">
                        <Icon as={type.icon} size={11} color={type.color} />
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

                <View className="mt-3 flex-row items-center border-t border-border pt-2">
                  <Pressable
                    onPress={() => setExpandedPost(expanded ? null : post.id)}
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
                  <View className="gap-3 border-t border-border pt-3">
                    {post.comments.length === 0 ? (
                      <Text className="text-[12px] text-muted-foreground">
                        Start the conversation.
                      </Text>
                    ) : (
                      post.comments.map((entry) => (
                        <View
                          key={entry.id}
                          className="rounded-xl bg-secondary/60 px-3 py-2.5"
                        >
                          <View className="flex-row items-center gap-2">
                            <Text className="text-[11.5px] font-semibold text-foreground">
                              {entry.authorName}
                            </Text>
                            {entry.isCommunityManager ? (
                              <Text className="text-[9.5px] font-semibold uppercase text-primary">
                                Team
                              </Text>
                            ) : null}
                          </View>
                          <Text className="mt-1 text-[12px] leading-5 text-muted-foreground">
                            {entry.body}
                          </Text>
                        </View>
                      ))
                    )}
                    <View className="min-h-12 flex-row items-end gap-2 rounded-xl border border-border bg-secondary p-1.5 pl-3">
                      <TextInput
                        value={comment}
                        onChangeText={setComment}
                        multiline
                        maxLength={500}
                        placeholder="Add a comment"
                        placeholderTextColor={mutedForeground}
                        className="max-h-24 min-h-9 flex-1 py-2 text-[13px] text-foreground"
                      />
                      <Pressable
                        disabled={!comment.trim() || commenting}
                        onPress={() => void submitComment(post.id)}
                        className={cn(
                          "h-10 w-10 items-center justify-center rounded-xl",
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
      className="h-10 w-10 items-center justify-center rounded-lg active:bg-accent"
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
      Alert.alert(
        initialValue ? "Couldn't update feedback" : "Couldn't post feedback",
        error instanceof Error ? error.message : "Please try again.",
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
        <View className="rounded-t-3xl border-t border-border bg-background px-5 pb-10 pt-4">
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
              onPress={onClose}
              className="h-11 w-11 items-center justify-center rounded-xl bg-secondary"
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
                    : "border-border bg-secondary",
                )}
              >
                <Icon as={option.icon} size={13} color={option.color} />
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
            className="min-h-12 rounded-xl border border-border bg-secondary px-3.5 text-[14px] text-foreground"
          />
          <TextInput
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={2000}
            placeholder="What should change, and why?"
            placeholderTextColor={mutedForeground}
            className="mt-3 min-h-28 rounded-xl border border-border bg-secondary px-3.5 py-3 text-[14px] leading-5 text-foreground"
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
