"use client";

import { useUser } from "@clerk/nextjs";
import { HowToModal } from "../../features/import/components/HowToModal";
import { HomeIntroSection } from "../../features/home/components/HomeIntroSection";
import { useHomePageActions } from "../../features/home/hooks/useHomePageActions";
import { ChatInput } from "../../features/chat/components/ChatInput";
import { useSidebar } from "@repo/ui/components/ui/sidebar";
import { cn } from "@repo/ui/lib/utils";

export default function HomePage() {
  const { state: sidebarState, isMobile: isSidebarMobile } = useSidebar();
  const { user } = useUser();
  const {
    selectedModel,
    setSelectedModel,
    webSearchEnabled,
    setWebSearchEnabled,
    imageAspectRatio,
    setImageAspectRatio,
    imageSize,
    setImageSize,
    agentId,
    setAgentId,
    isCreatingChat,
    startChatFromPrompt,
    importModalOpen,
    setImportModalOpen,
    importUrl,
    setImportUrl,
    importProvider,
    isImporting,
    handleImport,
  } = useHomePageActions();

  const firstName = user?.firstName?.trim() || "there";

  return (
    <>
      <HowToModal />

      <div className="relative flex h-full flex-col">
        <div className="flex-1 overflow-y-auto pb-32 lg:pb-0 flex flex-col justify-center items-center">
          <HomeIntroSection
            firstName={firstName}
            importModalOpen={importModalOpen}
            onImportModalOpenChange={setImportModalOpen}
            importUrl={importUrl}
            onImportUrlChange={setImportUrl}
            importProvider={importProvider}
            isImporting={isImporting}
            onImport={handleImport}
          />

          <div
            className={cn(
              "w-full transition-all duration-300 z-40",
              "fixed bottom-0 left-0 px-4 pb-5 pointer-events-none",
              "lg:static lg:mt-8 lg:w-full lg:max-w-3xl lg:px-4 lg:pb-0 lg:pointer-events-auto"
            )}
          >
            <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
              {/* Massive Glow Effect */}
              <div className="pointer-events-none absolute -z-10 bg-primary/25 blur-[80px] transition-all duration-500 max-lg:-bottom-4 max-lg:left-0 max-lg:h-[200px] max-lg:w-full lg:left-1/2 lg:top-1/2 lg:h-[250px] lg:w-[120%] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[100%] lg:blur-[120px]" />
              
              <ChatInput
                onSend={startChatFromPrompt}
                isLoading={isCreatingChat}
                disabled={false}
                model={selectedModel}
                onModelChange={setSelectedModel}
                webSearchEnabled={webSearchEnabled}
                onWebSearchToggle={() => setWebSearchEnabled((prev) => !prev)}
                imageAspectRatio={imageAspectRatio}
                imageSize={imageSize}
                onImageAspectRatioChange={setImageAspectRatio}
                onImageSizeChange={setImageSize}
                agentId={agentId}
                onAgentChange={setAgentId}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
