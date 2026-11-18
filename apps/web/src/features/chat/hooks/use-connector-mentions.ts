"use client";

import { api } from "@repo/convex/convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
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

// Shared with the Expo composer through @repo/core.
export { detectMention } from "@repo/core/chat-mentions";
