"use client";

import { useUser } from "@clerk/nextjs";
import { HowToModal } from "../../features/import/components/HowToModal";
import { HomeIntroSection } from "../../features/home/components/HomeIntroSection";
import { useHomePageActions } from "../../features/home/hooks/useHomePageActions";
import { ChatInput } from "../../features/chat/components/ChatInput";
import { useSidebar } from "@repo/ui/components/ui/sidebar";

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
        <div className="flex-1 overflow-y-auto pb-56">
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
        </div>

        <div
          data-sidebar-state={sidebarState}
          className="pointer-events-none fixed bottom-0 z-40 px-4 pb-5 transition-[left,width] duration-300"
          style={{
            left:
              !isSidebarMobile && sidebarState === "expanded"
                ? "var(--sidebar-width)"
                : 0,
            width:
              !isSidebarMobile && sidebarState === "expanded"
                ? "calc(100vw - var(--sidebar-width))"
                : "100vw",
          }}
        >
          <div className="pointer-events-auto relative mx-auto w-full max-w-3xl">
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
            />
          </div>
        </div>
      </div>
    </>
  );
}
