import { create } from "zustand";
import type { Provider } from "@repo/utils/url-safety";
import type { ImportPreviewResponse } from "../types";
import { getDefaultModel } from "@repo/ai/lib/models";

interface ImportStore {
  // State
  status:
  | "idle"
  | "scanning"
  | "previewing"
  | "importing"
  | "error"
  | "success";
  url: string;
  provider: Provider | null;
  preview: ImportPreviewResponse | null;
  error: string | null;
  chatId: string | null;
  requiresManualPaste: boolean;
  selectedModel: string;
  initialStream: MediaStream | null;

  // Actions
  setUrl: (url: string) => void;
  setProvider: (provider: Provider) => void;
  startScan: () => void;
  scanSuccess: (preview: ImportPreviewResponse) => void;
  scanError: (error: string, requiresManualPaste?: boolean) => void;
  startImport: () => void;
  importSuccess: (chatId: string) => void;
  importError: (error: string) => void;
  setSelectedModel: (model: string) => void;
  setInitialStream: (stream: MediaStream | null) => void;
  reset: () => void;
}

export const useImportStore = create<ImportStore>((set) => ({
  // Initial state
  status: "idle",
  url: "",
  provider: null,
  preview: null,
  error: null,
  chatId: null,
  requiresManualPaste: false,
  selectedModel: getDefaultModel().id,
  initialStream: null,

  // Actions
  setUrl: (url) => set({ url }),
  setProvider: (provider) => set({ provider }),

  startScan: () =>
    set({
      status: "scanning",
      error: null,
      preview: null,
      requiresManualPaste: false,
    }),

  scanSuccess: (preview) =>
    set({
      status: "previewing",
      preview,
      provider: preview.provider,
      error: null,
    }),

  scanError: (error, requiresManualPaste = false) =>
    set({
      status: "error",
      error,
      requiresManualPaste,
    }),

  startImport: () =>
    set({
      status: "importing",
      error: null,
    }),

  importSuccess: (chatId) =>
    set({
      status: "success",
      chatId,
      error: null,
    }),

  importError: (error) =>
    set({
      status: "error",
      error,
    }),

  setSelectedModel: (selectedModel) => set({ selectedModel }),
  setInitialStream: (initialStream) => set({ initialStream }),
  reset: () =>
    set({
      status: "idle",
      url: "",
      provider: null,
      preview: null,
      error: null,
      chatId: null,
      requiresManualPaste: false,
    }),
}));


