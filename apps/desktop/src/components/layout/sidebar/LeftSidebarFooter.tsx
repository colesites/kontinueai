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
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useTheme } from "@/components/theme/theme-provider";


const LeftSidebarFooter = () => {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();

  const name = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = (user?.firstName?.[0] ?? "U") + (user?.lastName?.[0] ?? "");

  const usage = useQuery(api.kode.getUsage, {});
  const planName = usage?.plan === "pro" ? "Pro" : "Free";
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const handleOpenProfile = () => {
    try {
      openUserProfile?.();
    } catch {
      setSettingsOpen(true);
    }
  };

  return (
    <div className="p-2 border-t border-border">
      {/* Full Width Account Profile Dropdown */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground h-[32px] cursor-pointer"
          >
            <div className="flex min-w-0 items-center gap-2">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={name}
                  className="size-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[9px] font-bold text-purple-700 dark:text-purple-200 ring-1 ring-purple-500/30">
                  {initials}
                </div>
              )}
              <span className="font-normal text-foreground truncate text-xs">
                {name} · {planName}
              </span>
            </div>
            <ChevronDown size={13} className="shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>

        {/* Dropdown Menu Card using Primitive Styles */}
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-56 rounded-xl border border-white/[0.08] bg-[#121215]/85 backdrop-blur-2xl shadow-2xl shadow-black/80 p-1"
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
              setSettingsOpen(true);
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

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
};

export default LeftSidebarFooter;
