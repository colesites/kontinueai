import { useKodeWorkspace } from "@/lib/kode-workspace";
import HomeView from "@/components/view/HomeView";
import CanvasView from "@/components/view/CanvasView";
import KodeView from "@/components/view/KodeView";

type ViewLayoutProps = {
  bottomPanelOpen: boolean;
  sidePanelOpen: boolean;
  onBottomPanelChange: (open: boolean) => void;
  onSidePanelChange: (open: boolean) => void;
};

const ViewLayout = ({
  bottomPanelOpen,
  sidePanelOpen,
  onBottomPanelChange,
  onSidePanelChange,
}: ViewLayoutProps) => {
  const { activeTab } = useKodeWorkspace();

  if (activeTab === "home") {
    return <HomeView />;
  }

  if (activeTab === "canvas") {
    return <CanvasView />;
  }

  return (
    <KodeView
      bottomPanelOpen={bottomPanelOpen}
      sidePanelOpen={sidePanelOpen}
      onBottomPanelChange={onBottomPanelChange}
      onSidePanelChange={onSidePanelChange}
    />
  );
};

export default ViewLayout;
