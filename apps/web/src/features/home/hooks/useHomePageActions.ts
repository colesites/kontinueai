"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@repo/convex/convex/_generated/api";
import { detectProvider } from "@repo/utils/url-safety";
import { getImportStrategy } from "../../import/lib/import-strategy";
import { getDefaultModelForPlan, getModelById } from "@repo/ai/lib/models";
import { isKaiModel } from "@repo/ai/lib/kai";
import {
  readCachedDefaultModel,
  writeCachedDefaultModel,
} from "@repo/core/default-model-storage";
import { savePendingChatDraft } from "@repo/core/pending-chat-draft";
import { MODEL_PROVIDER_MAP } from "../lib/model-provider-map";
import { useIsProPlan } from "@web/lib/use-plan-tier";

export function useHomePageActions() {
  const router = useRouter();
  const isPaidPlan = useIsProPlan();
  const persistedDefaultModel = useQuery(api.users.getDefaultModel, {});
  const createChat = useMutation(api.chats.createChat);
  const appendImportedMessagesToChat = useMutation(
    api.chats.appendImportedMessagesToChat,
  );
  const appendImportFailureMessageToChat = useMutation(
    api.chats.appendImportFailureMessageToChat,
  );
  const importViaFirecrawl = useAction(api.firecrawl.importIntoChat);
  const saveDefaultModel = useMutation(api.users.setDefaultModel);

  const fallbackModel = useMemo(
    () => getDefaultModelForPlan(isPaidPlan).id,
    [isPaidPlan],
  );

  const [localSelectedModel, setLocalSelectedModel] = useState<string | null>(null);
  const [cachedSelectedModel, setCachedSelectedModel] = useState<string | null>(
    () => readCachedDefaultModel(),
  );
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [imageAspectRatio, setImageAspectRatio] = useState("auto");
  const [imageSize, setImageSize] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  const importProvider = useMemo(() => detectProvider(importUrl), [importUrl]);
  const validatedPersistedModel =
    persistedDefaultModel && getModelById(persistedDefaultModel)
      ? persistedDefaultModel
      : null;
  useEffect(() => {
    if (!validatedPersistedModel) return;
    setCachedSelectedModel(validatedPersistedModel);
    writeCachedDefaultModel(validatedPersistedModel);
  }, [validatedPersistedModel]);

  const selectedModel =
    localSelectedModel ??
    validatedPersistedModel ??
    cachedSelectedModel ??
    fallbackModel;

  const setSelectedModel = useCallback(
    (modelId: string) => {
      if (!getModelById(modelId)) return;
      setLocalSelectedModel(modelId);
      setCachedSelectedModel(modelId);
      writeCachedDefaultModel(modelId);
      void saveDefaultModel({ modelId }).catch((error) => {
        console.error("Failed to persist selected model:", error);
      });
    },
    [saveDefaultModel],
  );

  const startChatFromPrompt = useCallback(
    async (prompt: string, files?: File[]) => {
      if (isCreatingChat || !prompt.trim()) return;
      setIsCreatingChat(true);

      try {
        const model = getModelById(selectedModel);
        const provider = model
          ? (MODEL_PROVIDER_MAP[model.provider] ?? "unknown")
          : "unknown";
        const title = prompt.trim().slice(0, 60) || "New Conversation";

        const chatId = await createChat({
          title,
          provider,
          importMethod: "manual",
          messages: [],
        });

        if (files?.length) {
          toast.info(
            "Attachments will be available once the chat opens. Please attach again if needed.",
          );
        }

        savePendingChatDraft(String(chatId), {
          text: prompt,
          model: selectedModel,
          webSearchEnabled:
            isPaidPlan || isKaiModel(selectedModel) ? webSearchEnabled : false,
          imageAspectRatio,
          imageSize,
        });

        router.push(`/chat/${chatId}`);
      } catch (err: unknown) {
        const data = (err as { data?: { message?: string } })?.data;
        const message =
          data?.message ||
          (err instanceof Error ? err.message : "Failed to start chat");
        toast.error(message);
      } finally {
        setIsCreatingChat(false);
      }
    },
    [
      createChat,
      imageAspectRatio,
      imageSize,
      isCreatingChat,
      router,
      selectedModel,
      isPaidPlan,
      webSearchEnabled,
    ],
  );

  const handleImport = useCallback(async () => {
    if (!importUrl.trim()) {
      toast.error("Please paste a shared link.");
      return;
    }

    try {
      const parsed = new URL(importUrl.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) {
        toast.error("Please enter a valid HTTP/HTTPS URL.");
        return;
      }
    } catch {
      toast.error("Please enter a valid URL.");
      return;
    }

    setIsImporting(true);
    try {
      const sourceUrl = importUrl.trim();
      const chatId = await createChat({
        title: "Importing conversation...",
        provider: importProvider || "unknown",
        sourceUrl,
        importMethod: "automatic",
        messages: [],
      });

      setImportUrl("");
      setImportModalOpen(false);

      void scrapeAndAppendImport({
        chatId,
        url: sourceUrl,
        appendImportedMessagesToChat,
        appendImportFailureMessageToChat,
        importViaFirecrawl,
      });

      router.push(`/chat/${chatId}?imported=true&importing=1`);
    } catch (err: unknown) {
      const data = (err as { data?: { message?: string } })?.data;
      const message =
        data?.message ||
        (err instanceof Error ? err.message : "Failed to import chat");
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  }, [
    appendImportFailureMessageToChat,
    appendImportedMessagesToChat,
    createChat,
    importProvider,
    importUrl,
    router,
  ]);

  return {
    selectedModel,
    setSelectedModel,
    webSearchEnabled:
      isPaidPlan || isKaiModel(selectedModel) ? webSearchEnabled : false,
    setWebSearchEnabled,
    imageAspectRatio,
    setImageAspectRatio,
    imageSize,
    setImageSize,
    isCreatingChat,
    startChatFromPrompt,
    importModalOpen,
    setImportModalOpen,
    importUrl,
    setImportUrl,
    importProvider,
    isImporting,
    handleImport,
  };
}

async function scrapeAndAppendImport({
  chatId,
  url,
  appendImportedMessagesToChat,
  appendImportFailureMessageToChat,
  importViaFirecrawl,
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
}) {
  // Route per strategy: Firecrawl-designated hosts (and everything while the
  // self-hosted scraper is disabled via SCRAPER_ENABLED) go through the Convex
  // Firecrawl action; only "scraper" hosts hit the Render scraper REST endpoint.
  if (getImportStrategy(url) === "firecrawl") {
    try {
      const result = await importViaFirecrawl({ chatId, url });
      // importIntoChat appends the messages / failure notice itself.
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

    await appendImportedMessagesToChat({
      chatId,
      title: data.title || "Imported Chat",
      messages: data.messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import chat";
    await appendImportFailureMessageToChat({ chatId, errorMessage: message });
    toast.error(message);
  }
}
