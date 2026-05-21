import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useAction } from "convex/react";
import { toast } from "sonner";
import { detectProvider } from "@repo/utils/url-safety";
import { useImportStore } from "../lib/useImportStore";
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

  const importIntoChat = useAction(api.firecrawl.importIntoChat);
  const createChat = useMutation(api.chats.createChat);
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
      void importIntoChat({
        chatId,
        url: sourceUrl,
      }).then((result) => {
        if (!result?.success) {
          toast.error(result?.error || "Failed to import chat");
        }
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
