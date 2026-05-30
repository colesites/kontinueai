import { Suspense } from "react";
import { ConnectorsClient } from "../../../../features/connectors/components/ConnectorsClient";

export default function ConnectorsPage() {
  return (
    <Suspense fallback={null}>
      <ConnectorsClient />
    </Suspense>
  );
}
