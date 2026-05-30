"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@repo/convex/convex/_generated/api";
import {
  CONNECTORS,
  type ConnectorLogo,
} from "../../connectors/lib/connector-catalog";

export type MentionItem = {
  provider: string;
  name: string;
  logo: ConnectorLogo;
  accountLabel?: string;
};

// The connectors the user has connected, as @-mention candidates.
export function useConnectorMentions(): MentionItem[] {
  const connectors = useQuery(api.connectors.listConnectors, {});
  return useMemo(() => {
    if (!connectors) return [];
    const items: MentionItem[] = [];
    for (const c of connectors) {
      if (!c.connected) continue;
      const def = CONNECTORS.find((d) => d.provider === c.provider);
      if (!def) continue;
      items.push({
        provider: c.provider,
        name: def.name,
        logo: def.logo,
        accountLabel: c.accountLabel ?? undefined,
      });
    }
    return items;
  }, [connectors]);
}

// Detect an in-progress "@token" immediately before the caret. Returns the
// query text and the index of the "@" so callers can splice a replacement.
export function detectMention(
  text: string,
  caret: number,
): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(^|\s)@(\w*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = caret - query.length - 1; // index of '@'
  return { query, start };
}
