import { Topbar } from "@/components/layout/topbar";
import PlanView from "@/components/view/PlanView";
import { ActionPanel } from "@/components/layout/ActionPanel";

type KodeViewProps = {
  bottomPanelOpen: boolean;
  sidePanelOpen: boolean;
  onBottomPanelChange: (open: boolean) => void;
  onSidePanelChange: (open: boolean) => void;
};

export default function KodeView({
  bottomPanelOpen,
  sidePanelOpen,
  onBottomPanelChange,
  onSidePanelChange,
}: KodeViewProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Row: main content + right panel */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1 overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-end px-4">
            <div className="pointer-events-auto">
              <Topbar
                bottomPanelOpen={bottomPanelOpen}
                sidePanelOpen={sidePanelOpen}
                onBottomPanelChange={onBottomPanelChange}
                onSidePanelChange={onSidePanelChange}
              />
            </div>
          </div>

          <PlanView />
        </div>

        <ActionPanel
          layout="side"
          open={sidePanelOpen}
          onClose={() => onSidePanelChange(false)}
        />
      </div>

      {/* Bottom panel */}
      <ActionPanel
        layout="bottom"
        open={bottomPanelOpen}
        onClose={() => onBottomPanelChange(false)}
      />
    </div>
  );
}
