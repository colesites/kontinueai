// kontinueai.com/llms.txt: a plain summary of Kontinue AI for AI assistants
// and answer engines (llmstxt.org format). Prices come from the same plan data
// as the pricing page, so they can't drift out of date.

import { appLinks, formatUsd, plans, product } from "@/data/product";
import { SITE_URL } from "@/lib/metadata";

export const revalidate = 86400;

export function GET() {
	const url = (path: string) => new URL(path, SITE_URL).toString();
	const priceList = plans
		.map((plan) =>
			plan.monthlyPriceUsd === 0
				? `- ${plan.name}: free. ${plan.bestFor}`
				: `- ${plan.name}: ${formatUsd(plan.monthlyPriceUsd)} per month. ${plan.bestFor}`,
		)
		.join("\n");

	const body = `# Kontinue AI

> Kontinue AI lets you keep going when you hit an AI limit. Paste a shared ChatGPT, Claude or Gemini chat link (or upload an export) and continue the same conversation, with its context, on K-AI 1.0 or another leading model. The desktop app also picks up Claude Code and Codex coding sessions when those tools hit their usage limits.

${product.positioning.long}

## What it does

- Continue a chat after a limit: ChatGPT "maximum length for this conversation" or free plan limit, Claude "usage limit reached" or "chat is too long", Gemini "you've reached your limit".
- Import by shared link: paste a chatgpt.com, claude.ai or gemini.google.com share link and Kontinue AI brings the messages over. Data exports are also supported.
- Pick the model: K-AI 1.0 (Kontinue AI's own model) or supported models from OpenAI, Anthropic, Google, xAI, DeepSeek and others, in one place.
- Desktop app with Kode: when Claude Code or Codex hits its rate limit, import the coding session and continue it on another model or agent, in the same project.
- Platforms: web (${product.company.appUrl}), desktop for macOS, Windows and Linux (alpha), iPhone, iPad and Android coming soon.

## Pricing

${priceList}

Full details: ${url("/pricing")}

## Key pages

- [Home](${url("/")}): what Kontinue AI is and how continuing a chat works
- [Import AI conversations](${url("/import-ai-conversations")}): supported sources and methods
- [Import a ChatGPT conversation](${url("/import-chatgpt-conversations")})
- [Import a Claude conversation](${url("/import-claude-conversations")})
- [Import a Gemini conversation](${url("/import-gemini-conversations")})
- [K-AI 1.0](${url("/kontinue-model")}): Kontinue AI's own model
- [Supported models](${url("/supported-models")})
- [Pricing](${url("/pricing")})
- [Download the desktop app](${url("/download")}): macOS, Windows and Linux
- [Security and privacy](${url("/security")})
- [Press and company facts](${url("/press")})
- [Blog](${url("/blog")})

## Company

- Founder: ${product.company.founder.name}
- Web app: ${appLinks.signUp}
- Support: ${product.company.email.support}
- Profiles: ${[...product.company.socialLinks.map((link) => link.href), ...product.company.profiles].join(", ")}
`;

	return new Response(body, {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
}
