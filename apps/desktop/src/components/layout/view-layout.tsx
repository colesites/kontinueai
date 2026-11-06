import { useKodeWorkspace } from "@/lib/kode-workspace";
import HomeView from "@/components/view/HomeView";
import CanvasView from "@/components/view/CanvasView";
import KodeView from "@/components/view/KodeView";

type ViewLayoutProps = {
  panelOpen: boolean;
  onPanelChange: (open: boolean) => void;
};

const ViewLayout = ({ panelOpen, onPanelChange }: ViewLayoutProps) => {
  const { activeTab } = useKodeWorkspace();

  if (activeTab === "home") {
    return <HomeView />;
  }

  if (activeTab === "canvas") {
    return <CanvasView />;
  }

  return (
    <KodeView panelOpen={panelOpen} onPanelChange={onPanelChange} />
  );
};

export default ViewLayout;
