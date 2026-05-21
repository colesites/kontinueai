type ImportProgress = {
  percent: number;
  stage: string;
};

export function getImportProgressFromTitle(title: string): ImportProgress | null {
  const compactTitle = title.replace(/\s+/g, " ").trim();
  const match = compactTitle.match(
    /^Importing\s+(\d{1,3})%\s*(?:[·-]\s*(.+))?$/i,
  );

  if (match) {
    return {
      percent: Math.max(1, Math.min(99, Number(match[1]) || 1)),
      stage: match[2]?.trim() || "Processing import",
    };
  }

  if (/^Importing conversation/i.test(compactTitle)) {
    return { percent: 5, stage: "Queued" };
  }

  return null;
}

export function getImportFailureMessage(
  dbMessages:
    | Array<{ content: string; metadata?: { isImported?: boolean } }>
    | undefined,
): string | null {
  return (
    dbMessages
      ?.find(
        (message) =>
          message.metadata?.isImported &&
          message.content.startsWith("Import failed:"),
      )
      ?.content.replace(/^Import failed:\s*/i, "") ?? null
  );
}

export function isImportParamSet(searchParams: { get: (name: string) => string | null }): boolean {
  return (
    searchParams.get("imported") === "true" ||
    searchParams.get("importing") === "1"
  );
}
