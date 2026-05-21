"use client";

import { AlertCircle } from "lucide-react";
import { useImportForm } from "../hooks/useImportForm";
import { ImportUrlInput } from "./ImportUrlInput";
import { ModelSelectorWrapper } from "./ModelSelectorWrapper";
import { ImportSubmitButton } from "./ImportSubmitButton";

export function ImportForm() {
  const {
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
  } = useImportForm();

  const helperText = hasUrl
    ? "We'll automatically scrape and import the conversation history for you."
    : "Or just select a model and start a fresh conversation without importing shortcut keys.";

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
          <p className="text-xs text-primary">{helperText}</p>
        </div>

        <div className="relative group/input flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <ImportUrlInput
            url={url}
            provider={provider}
            isProcessing={isProcessing}
            handleUrlChange={handleUrlChange}
            handleCreateChat={handleCreateChat}
          />

          <div className="shrink-0 w-full sm:w-[220px]">
            <ModelSelectorWrapper
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              disabled={isProcessing}
            />
          </div>
        </div>

        <ImportSubmitButton
          isProcessing={isProcessing}
          isStartingBlank={isStartingBlank}
          hasUrl={hasUrl}
          handleCreateChat={handleCreateChat}
        />

        {status === "error" && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm flex items-center gap-2">
            <AlertCircle size={16} />
            Failed to import: {error}
          </div>
        )}
      </div>
    </div>
  );
}
