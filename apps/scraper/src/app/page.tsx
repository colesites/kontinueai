"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Role = "user" | "assistant";
type MessageType = "text" | "code" | "image" | "file";

interface Message {
  id: string;
  role: Role;
  type: MessageType;
  content?: string;
  url?: string;
  language?: string;
}

interface ScrapeResult {
  title: string;
  site: string;
  messages: Message[];
  scrapedAt: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  t3chat: "T3 Chat",
  deepseek: "DeepSeek",
  copilot: "Copilot",
  qwen: "Qwen",
  manus: "Manus AI",
  grok: "Grok",
  kimi: "Kimi",
  metaai: "Meta AI",
};

const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: "bg-emerald-500",
  claude: "bg-amber-600",
  gemini: "bg-blue-500",
  perplexity: "bg-teal-500",
  t3chat: "bg-purple-500",
  deepseek: "bg-indigo-500",
  copilot: "bg-cyan-500",
  qwen: "bg-violet-500",
  manus: "bg-pink-500",
  grok: "bg-slate-700",
  kimi: "bg-fuchsia-600",
  metaai: "bg-sky-600",
};

interface Turn {
  key: string;
  role: Role;
  items: Message[];
}

// The scraper flattens each conversation turn into separate typed messages
// (text, code, image, file) that all share an id prefix `msg_<turn>_...`.
// Regroup them by that turn index so each turn's text + attachments render
// together, in order, in a single bubble — instead of dumping all images into
// a detached section.
function groupIntoTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  const byKey = new Map<string, Turn>();

  for (const message of messages) {
    const key = message.id.match(/^msg_(\d+)_/)?.[1] ?? message.id;
    let turn = byKey.get(key);
    if (!turn) {
      turn = { key, role: message.role, items: [] };
      byKey.set(key, turn);
      turns.push(turn);
    }
    turn.items.push(message);
  }

  // Attachments (images/files) render above the message text, matching how chat
  // apps show an upload on top with its caption underneath. Stable sort keeps
  // original order within each group.
  const rank = (type: MessageType) =>
    type === "image" || type === "file" ? 0 : 1;
  for (const turn of turns) {
    turn.items = turn.items
      .map((item, index) => ({ item, index }))
      .sort((a, b) => rank(a.item.type) - rank(b.item.type) || a.index - b.index)
      .map(({ item }) => item);
  }

  return turns;
}

function detectPlatformFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();

    if (host.includes("chat.openai.com") || host.includes("chatgpt.com")) return "chatgpt";
    if (host.includes("claude.ai") || host.includes("claude.com")) return "claude";
    if (host.includes("gemini.google.com") || host === "g.co") return "gemini";
    if (host.includes("perplexity.ai")) return "perplexity";
    if (host.includes("t3.chat")) return "t3chat";
    if (host.includes("deepseek.com")) return "deepseek";
    if (host.includes("copilot.microsoft.com") || host.includes("bing.com")) return "copilot";
    if (host.includes("qwen.ai") || host.includes("tongyi.aliyun.com")) return "qwen";
    if (host.includes("manus.ai") || host.includes("manus.im")) return "manus";
    if (host.includes("grok.com") || host.includes("x.com")) return "grok";
    if (host.includes("kimi.com") || host.includes("kimi.moonshot.cn")) return "kimi";
    if (host.includes("meta.ai")) return "metaai";
    return null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  // Avoid hydration mismatches on interactive controls: render the same
  // (disabled) markup on the server and the first client paint, then enable
  // after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const detectedPlatform = detectPlatformFromUrl(url);
  const isSupported = detectedPlatform !== null;

  const handleScrape = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 70000);

      const res = await fetch("http://localhost:4000/scrape-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey || "your_secret_key_here",
        },
        signal: controller.signal,
        body: JSON.stringify({ url: url.trim() }),
      });
      window.clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || data.message || "Failed to scrape");
      }

      setResult(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Request timed out. The platform likely blocked automated access.");
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Chat Scraper Demo</h1>
          <p className="text-zinc-400 mt-1">Paste a shared chat link to extract the conversation</p>
        </header>

        <div className="space-y-4 mb-8">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="your_secret_key_here"
              className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Shared Chat URL
            </label>
            <div className="flex gap-3">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && isSupported && handleScrape()}
                placeholder="https://chatgpt.com/share/..."
                className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-600 focus:border-transparent"
              />
              <button
                onClick={handleScrape}
                disabled={!mounted || !isSupported || loading}
                className="px-6 py-3 bg-zinc-100 text-zinc-900 font-medium rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Scraping..." : "Scrape"}
              </button>
            </div>
          </div>

          {url && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-400">Detected:</span>
              {isSupported ? (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium text-white ${PLATFORM_COLORS[detectedPlatform]}`}>
                  {PLATFORM_NAMES[detectedPlatform]}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30">
                  Unknown Platform
                </span>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400">Extracting conversation...</span>
            </div>
          </div>
        )}

        {result && (
          <div>
            <div className="mb-6">
              <h2 className="text-lg font-semibold">{result.title}</h2>
              <div className="flex items-center gap-3 mt-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${PLATFORM_COLORS[result.site]}`}>
                  {PLATFORM_NAMES[result.site]}
                </span>
                <span className="text-xs text-zinc-500">
                  {result.messages.length} messages · scraped {new Date(result.scrapedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {groupIntoTurns(result.messages).map((turn) => (
                <div
                  key={turn.key}
                  className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 space-y-2 ${
                      turn.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-100"
                    }`}
                  >
                    <div className="text-xs font-medium opacity-70">
                      {turn.role === "user" ? "You" : "Assistant"}
                    </div>
                    {turn.items.map((item) => {
                      if (item.type === "image" && item.url) {
                        return (
                          <img
                            key={item.id}
                            src={item.url}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="rounded-lg border border-black/20 max-h-80 max-w-full"
                          />
                        );
                      }
                      if (item.type === "file" && item.url) {
                        return (
                          <a
                            key={item.id}
                            href={item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-sm underline break-all opacity-90"
                          >
                            📎 {item.url}
                          </a>
                        );
                      }
                      if (item.type === "code") {
                        return (
                          <pre
                            key={item.id}
                            className="text-sm overflow-x-auto bg-black/30 rounded-lg p-3"
                          >
                            <code>{item.content}</code>
                          </pre>
                        );
                      }
                      return (
                        <div
                          key={item.id}
                          className="text-sm prose prose-invert prose-sm max-w-none prose-p:my-1 prose-li:my-0.5 prose-pre:my-1 prose-headings:my-1 prose-strong:font-semibold prose-a:underline"
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.content ?? ""}
                          </ReactMarkdown>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
