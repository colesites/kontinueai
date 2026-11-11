import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/convex-api";
import { useClerk, useUser } from "@clerk/clerk-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useQuery } from "convex/react";
import {
  ChevronDown,
  ExternalLink,
  Info,
  Laptop,
  LogOut,
  Moon,
  Settings,
  Sun,
  UserCircle,
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "@/components/theme/theme-provider";
import { useKodeWorkspace } from "@/lib/kode-workspace";
import { PLAN_LABEL } from "@/components/usage/KodeUsageCard";

const LeftSidebarFooter = () => {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const { openSettings } = useKodeWorkspace();

  const name = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User";
  // The footer shows the first name, like "Cole · Pro".
  const shortName = user?.firstName || name.split(" ")[0] || name;
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = (user?.firstName?.[0] ?? "U") + (user?.lastName?.[0] ?? "");

  const usage = useQuery(api.kodeUsage.getUsage, {});
  const planName = PLAN_LABEL[usage?.plan ?? "free"];
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleOpenProfile = () => {
    try {
      openUserProfile?.();
    } catch {
      openSettings("account");
    }
  };

  return (
    <div className="flex items-center gap-1 border-t border-white/60 p-2 dark:border-border">
      {/* Account menu: avatar, "Name · Plan" and a chevron; Settings sits on the right. */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-full py-1 pr-2.5 pl-1 text-left transition-colors duration-150 kontinue-hover data-[state=open]:bg-black/[0.04] dark:data-[state=open]:bg-white/[0.05]"
          >
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-black/[0.08] text-caption font-medium text-zinc-700 dark:bg-white/[0.12] dark:text-foreground/85">
                {initials.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="flex min-w-0 items-center gap-1 text-body">
              <span className="truncate font-medium text-zinc-800 dark:text-foreground">{shortName}</span>
              <span className="shrink-0 text-muted-foreground">· {planName}</span>
            </span>
            <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        {/* Dropdown Menu Card using Primitive Styles */}
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-56 rounded-[22px] liquid-glass-dropdown p-1.5"
        >
          {email && (
            <>
              <DropdownMenuLabel className="truncate text-xs text-muted-foreground px-2.5 py-1.5 font-normal">
                {email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}


          <DropdownMenuItem onSelect={() => handleOpenProfile()}>
            <UserCircle size={14} strokeWidth={1.25} />
            <span>Personal account</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              openSettings("general");
              setMenuOpen(false);
            }}
          >
            <Settings size={14} strokeWidth={1.25} />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>

          {/* Theme submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {theme === "dark" ? (
                <Moon size={14} strokeWidth={1.25} />
              ) : theme === "light" ? (
                <Sun size={14} strokeWidth={1.25} />
              ) : (
                <Laptop size={14} strokeWidth={1.25} />
              )}
              <span>Theme</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={6} alignOffset={-4}>
              <DropdownMenuItem onSelect={() => setTheme("dark")}>
                <Moon size={13} strokeWidth={1.25} />
                <span>Dark</span>
                {theme === "dark" && <span className="ml-auto text-purple-600 dark:text-purple-400 font-bold">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme("light")}>
                <Sun size={13} strokeWidth={1.25} />
                <span>Light</span>
                {theme === "light" && <span className="ml-auto text-purple-600 dark:text-purple-400 font-bold">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setTheme("system")}>
                <Laptop size={13} strokeWidth={1.25} />
                <span>System</span>
                {theme === "system" && <span className="ml-auto text-purple-600 dark:text-purple-400 font-bold">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          {/* Learn more submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Info size={14} strokeWidth={1.25} />
              <span>Learn more</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={6} alignOffset={-4}>
              <DropdownMenuItem onSelect={() => void openUrl("https://kontinueai.com/about")}>
                <span>About Kontinue AI</span>
                <ExternalLink size={13} className="ml-auto text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void openUrl("https://kontinueai.com/legal/privacy-policy")}>
                <span>Privacy policy</span>
                <ExternalLink size={13} className="ml-auto text-muted-foreground" />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void openUrl("https://kontinueai.com/legal/terms-of-service")}>
                <span>Terms of service</span>
                <ExternalLink size={13} className="ml-auto text-muted-foreground" />
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>


          <DropdownMenuItem
            variant="destructive"
            onSelect={() => void signOut()}
          >
            <LogOut size={14} strokeWidth={1.25} />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        aria-label="Settings"
        title="Settings (⌘,)"
        onClick={() => openSettings("general")}
        className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors kontinue-hover hover:text-foreground"
      >
        <Settings size={17} strokeWidth={1.5} />
      </button>
    </div>
  );
};

export default LeftSidebarFooter;
