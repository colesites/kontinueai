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
  LogOut,
  Settings,
  UserCircle,
} from "lucide-react";
import { useState } from "react";
import { SettingsDialog } from "@/components/settings/SettingsDialog";


const LeftSidebarFooter = () => {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();

  const name = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "User";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const initials = (user?.firstName?.[0] ?? "U") + (user?.lastName?.[0] ?? "");

  const usage = useQuery(api.kode.getUsage, {});
  const planName = usage?.plan === "pro" ? "Pro" : "Free";
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="p-2 border-t border-white/[0.05]">
      {/* Full Width Account Profile Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs text-[#98989e] transition-colors hover:bg-white/[0.06] hover:text-white h-[32px]"
          >
            <div className="flex min-w-0 items-center gap-2">
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt={name}
                  className="size-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[9px] font-bold text-white ring-1 ring-white/[0.15]">
                  {initials}
                </div>
              )}
              <span className="font-normal text-[#d1d1d6] truncate text-xs">
                {name} · {planName}
              </span>
            </div>
            <ChevronDown size={13} className="shrink-0 text-[#7c7c82]" />
          </button>
        </DropdownMenuTrigger>

        {/* Dropdown Menu Card using Primitive Styles */}
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={6}
          className="w-56"
        >
          {email && (
            <>
              <DropdownMenuLabel className="truncate text-xs text-[#8e8e93] px-2.5 py-1.5 font-normal">
                {email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem onSelect={() => openUserProfile()}>
            <UserCircle size={14} strokeWidth={1.25} />
            <span>Personal account</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setSettingsOpen(true);
            }}
          >
            <Settings size={14} strokeWidth={1.25} />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Learn more submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Info size={14} strokeWidth={1.25} />
              Learn more
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent alignOffset={-60} sideOffset={8}>
              <DropdownMenuItem onSelect={() => void openUrl("https://kontinueai.com/about")}>
                <span>About Kontinue AI</span>
                <ExternalLink size={13} className="ml-auto text-white/40" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void openUrl("https://kontinueai.com/legal/privacy-policy")}>
                <span>Privacy policy</span>
                <ExternalLink size={13} className="ml-auto text-white/40" />
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void openUrl("https://kontinueai.com/legal/terms-of-service")}>
                <span>Terms of service</span>
                <ExternalLink size={13} className="ml-auto text-white/40" />
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
