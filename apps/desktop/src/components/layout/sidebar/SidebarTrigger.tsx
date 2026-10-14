import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

const SidebarTrigger = ({children}: {children: React.ReactNode}) => {
  const { toggleSidebar, state } = useSidebar();
  const sidebarCollapsed = state === "collapsed";

  return (
    <Button
        aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
        variant="ghost"
        size="icon-sm"
        onClick={toggleSidebar}
        className="rounded-lg"
      >
        {children}
      </Button>
  )
}

export default SidebarTrigger;

