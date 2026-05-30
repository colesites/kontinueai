import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import { detectProvider } from "@repo/utils/url-safety";
import { useImportStore } from "../lib/useImportStore";
import { getImportStrategy } from "../lib/import-strategy";
import { api } from "@repo/convex/convex/_generated/api";
import { getModelById } from "@repo/ai/lib/models";
import { MODEL_PROVIDER_MAP } from "../../home/lib/model-provider-map";

export function useImportForm() {
  const router = useRouter();
  const {
    status,
    url,
    provider,
    selectedModel,
    setUrl,
    setSelectedModel,
    setProvider,
    startImport,
    importSuccess,
    importError,
    error,
    reset,
  } = useImportStore();

  const createChat = useMutation(api.chats.createChat);
  const appendImportedMessagesToChat = useMutation(
    api.chats.appendImportedMessagesToChat,
  );
  const appendImportFailureMessageToChat = useMutation(
    api.chats.appendImportFailureMessageToChat,
  );
  const importViaFirecrawl = useAction(api.firecrawl.importIntoChat);
  const updateChatTitle = useMutation(api.chats.updateChatTitle);
  const [isStartingBlank, setIsStartingBlank] = useState(false);

  useEffect(() => {
    reset();
  }, [reset]);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    const detected = detectProvider(value);
    setProvider(detected);
  };

  const handleCreateChat = async () => {
    if (!url.trim()) {
      await handleStartBlankChat();
      return;
    }
    await handleImport();
  };

  const handleStartBlankChat = async () => {
    setIsStartingBlank(true);
    try {
      const modelData = getModelById(selectedModel);
      const chatProvider =
        (modelData && MODEL_PROVIDER_MAP[modelData.provider]) ?? "unknown";

      const chatId = await createChat({
        title: "New Conversation",
        provider: chatProvider,
        importMethod: "manual",
        messages: [],
      });

      setUrl("");
      router.push(`/chat/${chatId}`);
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string } })?.data;
      const message =
        data?.message ||
        (err instanceof Error ? err.message : "Failed to start chat");
      console.error("Start chat error:", err);
      toast.error(message);
    } finally {
      setIsStartingBlank(false);
    }
  };

  const handleImport = async () => {
    try {
      const urlObj = new URL(url.trim());
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        toast.error("Please enter a valid HTTP/HTTPS URL");
        return;
      }
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    startImport();

    try {
      const sourceUrl = url.trim();

      const chatId = await createChat({
        title: "Importing conversation...",
        provider: provider || "unknown",
        sourceUrl,
        importMethod: "automatic",
        messages: [],
      });

      importSuccess(chatId);
      setUrl("");
      void scrapeAndAppendImport({
        chatId,
        url: sourceUrl,
        appendImportedMessagesToChat,
        appendImportFailureMessageToChat,
        importViaFirecrawl,
        updateChatTitle,
      });
      router.push(`/chat/${chatId}?imported=true&importing=1`);
    } catch (err: unknown) {
      const data = (err as { data?: { code?: string; message?: string } })
        ?.data;
      const message =
        data?.message ||
        (err instanceof Error ? err.message : "Failed to import chat");

      const isKnownImportLimitError =
        data?.code === "FREE_TIER_IMPORT_LIMIT" ||
        data?.code === "STARTER_TIER_IMPORT_LIMIT";

      if (!isKnownImportLimitError) {
        console.error("Import error:", err);
      }
      importError(message);
      toast.error(message);
    }
  };

  const isProcessing = status === "importing" || isStartingBlank;
  const hasUrl = url.trim().length > 0;

  return {
    url,
    status,
    provider,
    selectedModel,
    isProcessing,
    hasUrl,
    isStartingBlank,
    error,
    handleUrlChange,
    setSelectedModel,
    handleCreateChat,
  };
}

async function scrapeAndAppendImport({
  chatId,
  url,
  appendImportedMessagesToChat,
  appendImportFailureMessageToChat,
  importViaFirecrawl,
  updateChatTitle,
}: {
  chatId: string;
  url: string;
  appendImportedMessagesToChat: (args: {
    chatId: any;
    title: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }) => Promise<unknown>;
  appendImportFailureMessageToChat: (args: {
    chatId: any;
    errorMessage: string;
  }) => Promise<unknown>;
  importViaFirecrawl: (args: {
    chatId: any;
    url: string;
  }) => Promise<{ success: boolean; error?: string }>;
  updateChatTitle: (args: { chatId: any; title: string }) => Promise<unknown>;
}) {
  // Anti-bot walled platforms (Claude, T3Chat, Perplexity, Copilot) and unknown
  // hosts go through Firecrawl; everything else uses the self-hosted scraper.
  if (getImportStrategy(url) === "firecrawl") {
    try {
      const result = await importViaFirecrawl({ chatId, url });
      // importIntoChat appends messages / failure notices itself, so we only
      // surface the toast here.
      if (!result.success) {
        toast.error(result.error || "Failed to import chat");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to import chat";
      await appendImportFailureMessageToChat({ chatId, errorMessage: message });
      toast.error(message);
    }
    return;
  }

  // The scraper is a single REST round-trip with no streamed progress, so we
  // simulate smooth staged progress by writing the same "Importing N% · stage"
  // title that getImportProgressFromTitle parses — matching the Firecrawl UX.
  const stages: Array<{ until: number; label: string }> = [
    { until: 30, label: "Connecting to scraper" },
    { until: 55, label: "Loading shared page" },
    { until: 80, label: "Extracting messages" },
    { until: 90, label: "Almost done" },
  ];
  let percent = 8;
  const stageLabel = (p: number) =>
    stages.find((s) => p <= s.until)?.label ?? "Almost done";
  const pushProgress = () => {
    void updateChatTitle({
      chatId,
      title: `Importing ${percent}% · ${stageLabel(percent)}`,
    }).catch(() => {});
  };
  pushProgress();
  const ticker = setInterval(() => {
    // Ease toward 90% without ever reaching it until the real result lands.
    percent = Math.min(90, percent + Math.max(1, Math.round((90 - percent) / 6)));
    pushProgress();
  }, 600);

  try {
    const response = await fetch("/api/import/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.message || data.error || "Failed to import chat");
    }

    clearInterval(ticker);
    percent = 95;
    await updateChatTitle({
      chatId,
      title: "Importing 95% · Saving messages",
    }).catch(() => {});

    await appendImportedMessagesToChat({
      chatId,
      title: data.title || "Imported Chat",
      messages: data.messages,
    });
  } catch (error) {
    clearInterval(ticker);
    const message =
      error instanceof Error ? error.message : "Failed to import chat";
    await appendImportFailureMessageToChat({ chatId, errorMessage: message });
    toast.error(message);
  }
}
