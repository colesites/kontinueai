import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Topbar } from "@/components/layout/topbar";
import PlanView from "@/components/view/PlanView";
import DesignView from "@/components/view/DesignView";
import CodeView from "@/components/view/CodeView";
import ReviewView from "@/components/view/ReviewView";
import type { AppTab } from "@/components/layout/tab-context";

export type { AppTab };

type ViewLayoutProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
};

const ViewLayout = ({ activeTab, onTabChange }: ViewLayoutProps) => {
  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as AppTab)}
      className="relative h-full w-full"
    >
      {/* Tab nav floats above the full-height pages */}
      <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
        <div className="pointer-events-auto">
          <Topbar />
        </div>
      </div>

      <TabsContent value="plan" className="h-full">
        <PlanView />
      </TabsContent>

      <TabsContent value="design" className="h-full">
        <DesignView />
      </TabsContent>

      <TabsContent value="code" className="h-full">
        <CodeView />
      </TabsContent>

      <TabsContent value="review" className="h-full">
        <ReviewView />
      </TabsContent>
    </Tabs>
  );
};

export default ViewLayout;
