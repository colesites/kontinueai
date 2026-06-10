"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Mail,
  Send,
  Check,
  Copy,
  Pencil,
  Loader2,
  AlertCircle,
  Plus,
} from "lucide-react";
import { cn } from "@repo/ui/lib/utils";

type EmailDraft = {
  to: string;
  cc: string;
  subject: string;
  body: string;
};

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent" }
  | { status: "error"; message: string; needsReconnect?: boolean };

export function EmailComposer({ draft }: { draft: EmailDraft }) {
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [showCc, setShowCc] = useState(Boolean(draft.cc));
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [send, setSend] = useState<SendState>({ status: "idle" });

  const sent = send.status === "sent";
  const sending = send.status === "sending";
  const locked = sent || sending;

  const handleCopy = async () => {
    const text = `To: ${to}${cc ? `\nCc: ${cc}` : ""}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  };

  const handleSend = async () => {
    if (!to.trim()) {
      setSend({ status: "error", message: "Add at least one recipient." });
      return;
    }
    setSend({ status: "sending" });
    try {
      const res = await fetch("/api/connectors/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, cc, subject, body }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        needsReconnect?: boolean;
      };
      if (!res.ok || !data.ok) {
        setSend({
          status: "error",
          message: data.error ?? "Couldn't send the email. Try again.",
          needsReconnect: data.needsReconnect,
        });
        return;
      }
      setSend({ status: "sent" });
    } catch {
      setSend({ status: "error", message: "Network error — please try again." });
    }
  };

  const fieldBase =
    "w-full bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground/45 disabled:cursor-default";

  return (
    <div
      className={cn(
        // Stable, responsive width: full-bleed on mobile, a comfortable ~40rem
        // on desktop. Declaring it up front stops the bubble from reflowing from
        // its narrow streaming-text size when the card mounts.
        "not-prose my-3 w-[min(40rem,100%)] overflow-hidden rounded-2xl transition-all duration-300",
        "bg-foreground/[0.025] ring-1 ring-foreground/10",
        "shadow-[0_1px_0_color-mix(in_oklch,var(--foreground)_4%,transparent),0_8px_30px_-12px_color-mix(in_oklch,var(--foreground)_22%,transparent)]",
        sent && "ring-emerald-500/30",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-foreground/8 px-4 py-2.5">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-lg transition-colors",
            sent
              ? "bg-emerald-500/15 text-emerald-500"
              : "bg-primary/12 text-primary",
          )}
        >
          {sent ? <Check size={13} strokeWidth={2.5} /> : <Mail size={13} />}
        </span>
        <span className="text-[12.5px] font-semibold text-foreground/90">
          {sent ? "Email sent" : "Draft email"}
        </span>

        {!locked && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy email"
              className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground"
            >
              {copied ? (
                <Check size={13} className="text-emerald-500" strokeWidth={2.5} />
              ) : (
                <Copy size={13} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setEditing((e) => !e)}
              aria-label="Edit email"
              aria-pressed={editing}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors",
                editing
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-foreground/8 hover:text-foreground",
              )}
            >
              <Pencil size={12} />
              {editing ? "Done" : "Edit"}
            </button>
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="divide-y divide-foreground/6">
        <Row label="To">
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            disabled={locked || !editing}
            placeholder="name@example.com"
            className={fieldBase}
          />
          {!showCc && !locked && editing && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              className="ml-2 inline-flex items-center gap-0.5 whitespace-nowrap text-[11.5px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <Plus size={11} /> Cc
            </button>
          )}
        </Row>

        {showCc && (
          <Row label="Cc">
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              disabled={locked || !editing}
              placeholder="name@example.com"
              className={fieldBase}
            />
          </Row>
        )}

        <Row label="Subject">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={locked || !editing}
            placeholder="Subject"
            className={cn(fieldBase, "font-medium")}
          />
        </Row>

        <div className="px-4 py-3">
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            disabled={locked || !editing}
            rows={Math.min(Math.max(body.split("\n").length, 4), 16)}
            placeholder="Write your message…"
            className={cn(
              fieldBase,
              "resize-none whitespace-pre-wrap leading-relaxed",
            )}
          />
        </div>
      </div>

      {/* Footer / actions */}
      <div className="flex items-center gap-3 border-t border-foreground/8 px-4 py-2.5">
        {send.status === "error" ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-rose-500">
            <AlertCircle size={13} className="shrink-0" />
            <span className="truncate">{send.message}</span>
            {send.needsReconnect && (
              <Link
                href="/settings/connectors"
                className="ml-1 shrink-0 font-semibold underline underline-offset-2 hover:text-rose-400"
              >
                Reconnect
              </Link>
            )}
          </div>
        ) : sent ? (
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-500">
            <Check size={13} strokeWidth={2.5} /> Delivered via Gmail
          </span>
        ) : (
          <span className="truncate text-[11.5px] text-muted-foreground/60">
            {editing ? "Editing — review before sending" : "Review, then send from your Gmail"}
          </span>
        )}

        {!sent && (
          <button
            type="button"
            onClick={handleSend}
            disabled={sending}
            className={cn(
              "group relative ml-auto inline-flex shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-xl px-4 py-1.5 text-[12.5px] font-semibold transition-all duration-200",
              "bg-linear-to-br from-primary to-primary/85 text-primary-foreground ring-1 ring-primary/30",
              "shadow-[0_3px_10px_-2px_color-mix(in_oklch,var(--primary)_45%,transparent),inset_0_1px_0_color-mix(in_oklch,white_22%,transparent)]",
              "hover:scale-[1.03] active:scale-[0.97]",
              "disabled:scale-100 disabled:opacity-70",
            )}
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            {sending ? (
              <Loader2 size={13} className="relative animate-spin" />
            ) : (
              <Send size={13} className="relative" />
            )}
            <span className="relative">{sending ? "Sending…" : "Send"}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-12 shrink-0 text-[12px] font-medium text-muted-foreground/70">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
