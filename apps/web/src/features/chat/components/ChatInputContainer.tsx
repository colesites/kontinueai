import { ArrowDown, ArrowUp } from "lucide-react";
import { ChatInput } from "./ChatInput";

type ChatInputContainerProps = {
  sidebarState: string;
  isSidebarMobile: boolean;
  showScrollToBottomButton: boolean;
  showScrollToTopButton: boolean;
  onScrollToBottom: () => void;
  onScrollToTop: () => void;
  onSend: (content: string, files?: File[]) => void;
  isLoading: boolean;
  disabled?: boolean;
  onStop: () => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  webSearchEnabled: boolean;
  onWebSearchToggle: () => void;
  imageAspectRatio: string;
  imageSize: string | null;
  onImageAspectRatioChange: (val: string) => void;
  onImageSizeChange: (val: string | null) => void;
};

export function ChatInputContainer({
  sidebarState,
  isSidebarMobile,
  showScrollToBottomButton,
  showScrollToTopButton,
  onScrollToBottom,
  onScrollToTop,
  onSend,
  isLoading,
  disabled = false,
  onStop,
  selectedModel,
  onModelChange,
  webSearchEnabled,
  onWebSearchToggle,
  imageAspectRatio,
  imageSize,
  onImageAspectRatioChange,
  onImageSizeChange,
}: ChatInputContainerProps) {
  const scrollButtonClasses =
    "group flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-black/10 text-white shadow-xl backdrop-blur-sm transition-all hover:bg-white/10 hover:scale-110 active:scale-95 animate-in fade-in zoom-in duration-200";

  return (
    <div
      data-sidebar-state={sidebarState}
      className="pointer-events-none fixed bottom-0 z-40 px-3 pb-4 sm:px-4 lg:px-3 transition-[left,width] duration-300"
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
        {!isSidebarMobile && (showScrollToTopButton || showScrollToBottomButton) && (
          <div className="absolute bottom-38 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
            {showScrollToTopButton && (
              <button
                onClick={onScrollToTop}
                className={scrollButtonClasses}
                aria-label="Scroll to top"
              >
                <ArrowUp
                  size={18}
                  className="transition-transform group-hover:-translate-y-0.5"
                />
              </button>
            )}
            {showScrollToBottomButton && (
              <button
                onClick={onScrollToBottom}
                className={scrollButtonClasses}
                aria-label="Scroll to bottom"
              >
                <ArrowDown
                  size={18}
                  className="transition-transform group-hover:translate-y-0.5"
                />
              </button>
            )}
          </div>
        )}
        <ChatInput
          onSend={onSend}
          isLoading={isLoading}
          onStop={onStop}
          disabled={disabled}
          model={selectedModel}
          onModelChange={onModelChange}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={onWebSearchToggle}
          imageAspectRatio={imageAspectRatio}
          imageSize={imageSize}
          onImageAspectRatioChange={onImageAspectRatioChange}
          onImageSizeChange={onImageSizeChange}
        />
      </div>
    </div>
  );
}
