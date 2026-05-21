"use client";

import { useUser } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@repo/convex/convex/_generated/api";
import { SidebarAccountSection } from "./sidebar/SidebarAccountSection";
import { SidebarChatsSection } from "./sidebar/SidebarChatsSection";
import { SidebarHeaderSection } from "./sidebar/SidebarHeaderSection";
import { Sidebar as SidebarPrimitive, SidebarContent, useSidebar } from "@repo/ui/components/ui/sidebar";
import { usePlanTier } from "../lib/use-plan-tier";

export function Sidebar() {
  const pathname = usePathname();
  const sidebar = useSidebar();
  const { user } = useUser();
  const planTier = usePlanTier();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { setOpen, setOpenMobile, isMobile } = sidebar;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        if (isMobile) setOpenMobile(true);
        else setOpen(true);
        requestAnimationFrame(() => {
          const input = document.getElementById("sidebar-thread-search");
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
        });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen, setOpenMobile, isMobile]);

  const isSearching = searchQuery.trim().length > 0;
  const isDebouncing = searchQuery !== debouncedQuery;

  const allChats = useQuery(api.chats.getUserChats, isSearching ? "skip" : {});
  const searchedChats = useQuery(
    api.chats.searchChats,
    isSearching && debouncedQuery.trim() ? { query: debouncedQuery } : "skip",
  );

  const chats = isSearching ? searchedChats : allChats;
  const isLoading = isSearching
    ? isDebouncing || searchedChats === undefined
    : allChats === undefined;

  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "";
  const userEmail = user?.primaryEmailAddress?.emailAddress ?? "";
  const userInitial =
    user?.firstName?.charAt(0) ?? displayName.charAt(0) ?? "U";

  const handleNavigate = () => {
    if (sidebar.isMobile) {
      sidebar.setOpenMobile(false);
    }
  };

  return (
    <SidebarPrimitive
      variant="inset"
      collapsible="offcanvas"
      className="text-sidebar-foreground"
    >
      <SidebarHeaderSection
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onClearSearch={() => setSearchQuery("")}
        onNavigate={handleNavigate}
      />

      <SidebarContent className="px-2 py-3">
        <SidebarChatsSection
          chats={chats}
          isLoading={isLoading}
          pathname={pathname}
          debouncedQuery={debouncedQuery}
          onNavigate={handleNavigate}
        />
      </SidebarContent>

      <SidebarAccountSection
        displayName={displayName}
        userEmail={userEmail}
        userInitial={userInitial}
        userImageUrl={user?.imageUrl}
        planTier={planTier}
        onNavigate={handleNavigate}
      />
    </SidebarPrimitive>
  );
}
