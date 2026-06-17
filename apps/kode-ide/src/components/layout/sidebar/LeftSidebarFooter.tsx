import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useClerk, useUser } from "@clerk/clerk-react";
import {
  ChevronRight,
  CircleGauge,
  LogOut,
  Settings,
  Smartphone,
  UserCircle,
} from "lucide-react";

const LeftSidebarFooter = () => {
  const { signOut, openUserProfile } = useClerk();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? "Signed in";

  return (
    <div className="px-3 pt-2 pb-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="surface-raised flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-foreground transition-colors duration-150 hover:bg-white/[0.06] active:scale-[0.99]"
          >
            <Settings size={17} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate text-left">Settings</span>
            <Smartphone size={16} className="shrink-0 text-foreground/45" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-white/[0.08] bg-[oklch(0.2_0.004_260)] p-2 shadow-2xl"
        >
          <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 text-foreground/58 text-sm">
            <UserCircle size={18} />
            <span className="min-w-0 truncate">{email}</span>
          </DropdownMenuLabel>
          <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2.5 text-foreground/58 text-sm">
            <Settings size={18} />
            <span>Personal account</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="my-2 bg-white/[0.08]" />
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={() => openUserProfile()}
          >
            <UserCircle size={18} />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={() => openUserProfile()}
          >
            <Settings size={18} />
            <span>Settings</span>
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-2 bg-white/[0.08]" />
          <DropdownMenuItem className="py-2.5 text-base">
            <CircleGauge size={18} />
            <span>Usage remaining</span>
            <ChevronRight size={18} className="ml-auto text-foreground/45" />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="py-2.5 text-base"
            onSelect={() => void signOut()}
          >
            <LogOut size={18} />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};

export default LeftSidebarFooter;
