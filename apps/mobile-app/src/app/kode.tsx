import { useState } from "react";
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
import * as WebBrowser from "expo-web-browser";
import { useMutation, useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import {
  Code2,
  ExternalLink,
  FileCode2,
  Plus,
  Sparkles,
  Star,
  X,
} from "lucide-react-native";

import { ScreenHeader } from "@/components/screen-header";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { API_BASE_URL } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "#94a3b8" },
  building: { label: "Building", color: "#f59e0b" },
  ready: { label: "Ready", color: "#22c55e" },
  error: { label: "Needs attention", color: "#ef4444" },
};

export default function KodeScreen() {
  const projects = useQuery(api.kodeWeb.listProjects, { limit: 30 });
  const credits = useQuery(api.kodeWeb.getCredits, {});
  const createProject = useMutation(api.kodeWeb.createProject);
  const [composerOpen, setComposerOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [creating, setCreating] = useState(false);

  const openWorkspace = (projectId?: string) => {
    const url = projectId
      ? `${API_BASE_URL}/kode/${projectId}`
      : `${API_BASE_URL}/kode`;
    void WebBrowser.openBrowserAsync(url);
  };

  const create = async () => {
    const value = prompt.trim();
    if (value.length < 3 || creating) return;
    setCreating(true);
    try {
      const projectId = await createProject({ prompt: value });
      setPrompt("");
      setComposerOpen(false);
      openWorkspace(String(projectId));
    } catch (error) {
      const data = (error as { data?: { message?: string } })?.data;
      Alert.alert(
        "Couldn't create Kode project",
        data?.message ??
          (error instanceof Error ? error.message : "Please try again."),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView className="bg-background" style={{ flex: 1 }} edges={["top"]}>
      <ScreenHeader
        title="Kode"
        right={
          credits?.isPro ? (
            <Pressable
              onPress={() => setComposerOpen(true)}
              className="min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-3.5 active:opacity-90"
            >
              <Icon as={Plus} size={17} className="text-primary-foreground" />
              <Text className="text-[13px] font-semibold text-primary-foreground">
                New
              </Text>
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerClassName="gap-5 px-4 pb-12"
        showsVerticalScrollIndicator={false}
      >
        <View className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/8 p-4">
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
              <Icon as={Code2} size={21} className="text-primary" />
            </View>
            <View className="flex-1">
              <Text className="text-[16px] font-semibold text-foreground">
                Build with Kode
              </Text>
              <Text className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                Start projects and follow builds from mobile. The full editor
                opens in the web workspace.
              </Text>
            </View>
          </View>
        </View>

        {credits === undefined ? (
          <View className="h-20 items-center justify-center rounded-2xl bg-foreground/5">
            <ActivityIndicator size="small" />
          </View>
        ) : !credits?.isPro ? (
          <View className="items-center rounded-2xl border border-border bg-card px-5 py-10">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
              <Icon as={Sparkles} size={22} className="text-primary" />
            </View>
            <Text className="mt-4 text-[16px] font-semibold text-foreground">
              Kode is on Pro and Max
            </Text>
            <Text className="mt-2 text-center text-[12.5px] leading-5 text-muted-foreground">
              Upgrade to create and iterate on complete web projects with K-AI.
            </Text>
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(`${API_BASE_URL}/pricing`)
              }
              className="mt-5 min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-4 active:opacity-90"
            >
              <Text className="text-[13px] font-semibold text-primary-foreground">
                View plans
              </Text>
              <Icon
                as={ExternalLink}
                size={14}
                className="text-primary-foreground"
              />
            </Pressable>
          </View>
        ) : (
          <>
            <View className="flex-row gap-2">
              <Metric label="Credits left" value={credits.remaining} />
              <Metric
                label="Builds used"
                value={`${credits.buildsUsed}/${credits.buildLimit}`}
              />
            </View>

            <View>
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-[15px] font-semibold text-foreground">
                  Projects
                </Text>
                <Pressable
                  onPress={() => openWorkspace()}
                  className="min-h-11 justify-center px-2"
                >
                  <Text className="text-[12px] font-semibold text-primary">
                    Open web Kode
                  </Text>
                </Pressable>
              </View>
              {projects === undefined ? (
                <View className="gap-2">
                  {[1, 2, 3].map((item) => (
                    <View
                      key={item}
                      className="h-24 rounded-2xl bg-foreground/5"
                    />
                  ))}
                </View>
              ) : projects.length === 0 ? (
                <Pressable
                  onPress={() => setComposerOpen(true)}
                  className="items-center rounded-2xl border border-dashed border-border px-5 py-12 active:bg-accent"
                >
                  <Icon
                    as={FileCode2}
                    size={23}
                    className="text-muted-foreground"
                  />
                  <Text className="mt-3 text-[14px] font-medium text-foreground">
                    Create your first project
                  </Text>
                  <Text className="mt-1.5 text-center text-[12px] text-muted-foreground">
                    Describe what you want to build and Kode will prepare the
                    workspace.
                  </Text>
                </Pressable>
              ) : (
                <View className="gap-2">
                  {projects.map((project) => {
                    const status =
                      STATUS_META[project.status] ?? STATUS_META.draft!;
                    return (
                      <Pressable
                        key={project._id}
                        onPress={() => openWorkspace(project._id)}
                        className="min-h-24 flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3.5 active:bg-accent"
                      >
                        <View className="h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                          <Icon
                            as={FileCode2}
                            size={19}
                            className="text-muted-foreground"
                          />
                        </View>
                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              className="flex-1 text-[14px] font-semibold text-foreground"
                            >
                              {project.title}
                            </Text>
                            {project.starred ? (
                              <Icon
                                as={Star}
                                size={13}
                                className="text-amber-400"
                              />
                            ) : null}
                          </View>
                          <Text
                            numberOfLines={2}
                            className="mt-1 text-[11.5px] leading-4 text-muted-foreground"
                          >
                            {project.description}
                          </Text>
                          <View className="mt-2 flex-row items-center gap-1.5">
                            <View
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ backgroundColor: status.color }}
                            />
                            <Text
                              className="text-[10.5px] font-medium"
                              style={{ color: status.color }}
                            >
                              {status.label}
                            </Text>
                          </View>
                        </View>
                        <Icon
                          as={ExternalLink}
                          size={16}
                          className="text-muted-foreground/60"
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <Modal
        visible={composerOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setComposerOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/55"
        >
          <View className="rounded-t-3xl border-t border-border bg-background px-5 pb-10 pt-4">
            <View className="mb-5 flex-row items-center justify-between">
              <View>
                <Text className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                  Kode
                </Text>
                <Text className="mt-1 text-[20px] font-semibold text-foreground">
                  Start a project
                </Text>
              </View>
              <Pressable
                onPress={() => setComposerOpen(false)}
                className="h-11 w-11 items-center justify-center rounded-xl bg-secondary"
              >
                <Icon as={X} size={18} className="text-muted-foreground" />
              </Pressable>
            </View>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              multiline
              maxLength={8000}
              placeholder="Describe the app or site you want to build…"
              placeholderTextColor="#7c6c77"
              className="min-h-32 rounded-2xl border border-border bg-secondary px-4 py-3 text-[14px] leading-5 text-foreground"
            />
            <Pressable
              disabled={prompt.trim().length < 3 || creating}
              onPress={() => void create()}
              className={cn(
                "mt-4 min-h-12 flex-row items-center justify-center gap-2 rounded-xl",
                prompt.trim().length >= 3 && !creating
                  ? "bg-primary"
                  : "bg-primary/35",
              )}
            >
              {creating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Icon
                  as={Sparkles}
                  size={16}
                  className="text-primary-foreground"
                />
              )}
              <Text className="text-[13.5px] font-semibold text-primary-foreground">
                {creating ? "Creating…" : "Create and open workspace"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View className="flex-1 rounded-2xl border border-border bg-card p-4">
      <Text className="text-[19px] font-semibold text-foreground">{value}</Text>
      <Text className="mt-1 text-[11.5px] text-muted-foreground">{label}</Text>
    </View>
  );
}
