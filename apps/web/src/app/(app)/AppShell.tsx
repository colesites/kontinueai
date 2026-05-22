"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { Plus, Search } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Sidebar as AppSidebar } from "../../components/Sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@repo/ui/components/ui/sidebar";
import { cn } from "@repo/ui/lib/utils";
import { ModeToggle } from "../../components/ModeToggle";
import { ShareButton } from "../../components/ShareButton";
import { ChatProvider, useChatContext } from "../../providers/ChatProvider";
import LoadingFallback from "../../components/LoadingFallback";
import { UserSync } from "../../components/UserSync";

export function AppShell({
  children,
  defaultOpen = true,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const { isLoaded } = useUser();

  if (!isLoaded) {
    return <LoadingFallback />;
  }

  return (
    <ChatProvider>
      <UserSync />
      <SidebarProvider defaultOpen={defaultOpen}>
        <ShellLayout>{children}</ShellLayout>
      </SidebarProvider>
    </ChatProvider>
  );
}

import { useCanvasContext } from "../../features/canvas/contexts/CanvasContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/ui/select";

function ShellLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isMobile, open, openMobile, setOpenMobile, setOpen } = useSidebar();
  const { chatId, chatTitle } = useChatContext();
  const { tab, setTab } = useCanvasContext();
  const isHome = pathname === "/";
  const isCanvas = pathname === "/canvas";
  const isChatRoute = pathname.startsWith("/chat/");

  const floatingPillClasses =
    "pointer-events-auto glass bg-background/40 backdrop-blur-3xl rounded-2xl p-1 text-foreground transition-all duration-300";

  const toolbarButtonClasses =
    "inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-foreground/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  const focusSidebarSearch = () => {
    const input = document.getElementById(
      "sidebar-thread-search",
    ) as HTMLInputElement | null;
    if (!input) return;
    input.focus();
    const valueLength = input.value.length;
    input.setSelectionRange(valueLength, valueLength);
  };

  const handleSearchClick = () => {
    if (isMobile && !openMobile) {
      setOpenMobile(true);
      window.setTimeout(focusSidebarSearch, 220);
    } else {
      setOpen(true);
      window.requestAnimationFrame(focusSidebarSearch);
    }
  };

  const handleNewChatClick = () => {
    if (isMobile && openMobile) {
      setOpenMobile(false);
    }
  };

  const hideTriggerGroup = open || openMobile;

  return (
    <>
      <AppSidebar />
      <SidebarInset className="bg-background h-dvh flex flex-col overflow-hidden relative md:peer-data-[variant=inset]:h-[calc(100dvh-1rem)] md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:ring-1 md:peer-data-[variant=inset]:ring-foreground/8 md:peer-data-[variant=inset]:shadow-[0_2px_8px_-4px_color-mix(in_oklch,black_15%,transparent)]">
        {/* Floating top controls */}
        <div
          className={cn(
            "pointer-events-none fixed inset-x-0 top-3 z-50 flex items-start justify-between px-3 transition-all duration-300 ease-in-out",
            open && !isMobile && "pl-[calc(var(--sidebar-width)+12px)]",
          )}
        >
          <div className="flex items-start gap-3">
            {/* Standard Icons Pill - Hides when sidebar is open because sidebar has them */}
            <div
              className={cn(
                floatingPillClasses,
                "flex items-center gap-1",
                hideTriggerGroup && "pointer-events-none opacity-0 scale-95",
              )}
              aria-hidden={hideTriggerGroup}
            >
              <SidebarTrigger className={toolbarButtonClasses} />
              <button
                type="button"
                onClick={handleSearchClick}
                className={toolbarButtonClasses}
                aria-label="Search chats"
              >
                <Search className="size-4" />
              </button>
              <Link
                href="/"
                className={toolbarButtonClasses}
                aria-label="Start new chat"
                onClick={handleNewChatClick}
              >
                <Plus className="size-4" />
              </Link>
            </div>

            {/* Canvas Navigation Switcher - STAYS visible when sidebar is open */}
            {isCanvas && (
              <>
                <div
                  className={cn(floatingPillClasses, "hidden sm:flex items-center gap-1")}
                >
                  <button
                    type="button"
                    onClick={() => setTab("community")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-semibold rounded-xl transition-all duration-200",
                      tab === "community"
                        ? "bg-foreground/8 text-foreground shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]"
                        : "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
                    )}
                  >
                    Community
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab("mine")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-semibold rounded-xl transition-all duration-200",
                      tab === "mine"
                        ? "bg-foreground/8 text-foreground shadow-[inset_0_1px_0_color-mix(in_oklch,var(--foreground)_8%,transparent)]"
                        : "text-muted-foreground hover:bg-foreground/4 hover:text-foreground",
                    )}
                  >
                    My Creations
                  </button>
                </div>

                <div className={cn(floatingPillClasses, "flex sm:hidden items-center gap-1")}>
                  <Select
                    value={tab}
                    onValueChange={(value) =>
                      setTab(value as "community" | "mine")
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className="bg-transparent border-none shadow-none h-8 text-xs font-semibold px-3 rounded-xl hover:bg-foreground/4 transition-colors"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="community">Community</SelectItem>
                      <SelectItem value="mine">My Creations</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          <div className={cn(floatingPillClasses, "flex items-center gap-1")}>
            {chatId && chatTitle && (
              <ShareButton chatId={chatId} chatTitle={chatTitle} />
            )}
            <ModeToggle />
          </div>
        </div>

        <div
          className={cn(
            "flex flex-1 flex-col min-h-0",
            isChatRoute && "lg:pt-3",
          )}
        >
          <div
            id="chat-scroll-container"
            className={cn(
              "flex-1 overflow-y-auto",
              isHome
                ? "pt-0"
                : isCanvas
                  ? "pt-16 lg:pt-0"
                  : isChatRoute
                    ? "pt-14 lg:pt-0"
                    : "pt-9",
            )}
          >
            {children}
          </div>
        </div>
      </SidebarInset>
    </>
  );
}
