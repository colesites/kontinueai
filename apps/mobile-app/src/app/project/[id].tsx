import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { FolderOpen, MessageSquare, Pin, X } from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";

export default function ProjectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = id as Id<"projects">;

  const project = useQuery(api.projects.getProject, projectId ? { projectId } : "skip");
  const chats = useQuery(api.projects.listProjectChats, projectId ? { projectId } : "skip");
  const assignChatToProject = useMutation(api.projects.assignChatToProject);

  const removeFromProject = (chatId: Id<"chats">, title: string) => {
    Alert.alert("Remove from project?", `"${title}" will move back to your unfiled chats.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        onPress: () => {
          assignChatToProject({ chatId, projectId: null }).catch(() =>
            Alert.alert("Couldn't remove chat", "Please try again."),
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader title={project?.name ?? "Project"} leading="back" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="px-4 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {project?.description ? (
          <Text className="mb-4 text-[13.5px] leading-5 text-muted-foreground">
            {project.description}
          </Text>
        ) : null}

        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
          Chats {chats ? `· ${chats.length}` : ""}
        </Text>

        {chats === undefined ? (
          <View className="gap-2">
            {[1, 2, 3].map((i) => (
              <View key={i} className="h-12 rounded-xl bg-foreground/5" />
            ))}
          </View>
        ) : chats.length === 0 ? (
          <View className="items-center rounded-2xl border border-dashed border-border px-4 py-10">
            <Icon as={FolderOpen} size={22} className="text-muted-foreground/60" />
            <Text className="mt-3 text-center text-[13px] leading-5 text-muted-foreground">
              No chats in this project yet. Move chats here from the sidebar
              (long-press a chat → Move to project).
            </Text>
          </View>
        ) : (
          chats.map((chat) => (
            <Pressable
              key={chat._id}
              onPress={() => router.push(`/chat/${chat._id}` as Href)}
              className="h-13 flex-row items-center gap-3 rounded-xl px-2 py-2 active:bg-accent"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-secondary">
                <Icon as={MessageSquare} size={15} className="text-muted-foreground" />
              </View>
              <Text numberOfLines={1} className="flex-1 text-[14.5px] text-foreground/90">
                {chat.title}
              </Text>
              {chat.pinnedAt && chat.pinnedAt > 0 ? (
                <Icon as={Pin} size={14} className="text-primary" />
              ) : null}
              <Pressable
                hitSlop={8}
                onPress={() => removeFromProject(chat._id, chat.title)}
                className="h-7 w-7 items-center justify-center rounded-md active:bg-foreground/10"
              >
                <Icon as={X} size={14} className="text-muted-foreground" />
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
