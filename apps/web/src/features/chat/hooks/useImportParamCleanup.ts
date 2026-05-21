import { useEffect } from "react";
import { isImportParamSet } from "../lib/import-status";

type DbMessage = { _id: string };

export function useImportParamCleanup({
  dbMessages,
  router,
  searchParams,
}: {
  dbMessages: DbMessage[] | undefined;
  router: { replace: (href: string) => void };
  searchParams: { get: (name: string) => string | null };
}) {
  useEffect(() => {
    if (!dbMessages) return;
    const hasImportParams = isImportParamSet(searchParams);
    if (!hasImportParams || dbMessages.length === 0) return;
    router.replace(window.location.pathname);
  }, [dbMessages, router, searchParams]);
}
