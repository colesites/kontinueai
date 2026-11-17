// The line under a message: time, copy, rewind, fork, edit, read aloud.

import { useState } from "react";
import { MessageAction, MessageActions } from "@/components/ai-elements/message";
import { CopyIcon, EditIcon, ForkIcon, RewindIcon, SpeakIcon } from "@/components/chat/message-action-icons";
import type { ChatMessage } from "./messages";

export function formatMessageStamp(timestamp?: number): string {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const dayDiff = Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / 86_400_000,
  );
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  if (dayDiff < 7)
    return `${date.toLocaleDateString([], { weekday: "short" })}, ${time}`;
  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function speakAloud(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) {
    synth.cancel();
    return;
  }
  const spoken = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/#+\s/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!spoken) return;
  synth.speak(new SpeechSynthesisUtterance(spoken));
}

export function MessageMeta({
  message,
  onRewind,
  onFork,
  onEdit,
}: {
  message: ChatMessage;
  onRewind?: () => void;
  onFork?: () => void;
  onEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const stamp = formatMessageStamp(message.createdAt);

  if (message.status === "thinking") return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — nothing to do.
    }
  };

  const copyButton = (
    <MessageAction
      tooltip="Copy"
      onClick={copy}
      className="size-6 rounded-md text-foreground/45 hover:text-foreground"
    >
      <CopyIcon copied={copied} />
    </MessageAction>
  );
  const forkButton = onFork ? (
    <MessageAction
      tooltip="Fork from here"
      onClick={onFork}
      className="size-6 rounded-md text-foreground/45 hover:text-foreground"
    >
      <ForkIcon />
    </MessageAction>
  ) : null;
  const time = stamp ? (
    <span className="px-1 text-caption text-foreground/35">{stamp}</span>
  ) : null;

  return (
    <MessageActions className="msg-actions -mt-0.5 w-fit gap-0.5 px-0.5 text-foreground/55 transition-opacity group-[.is-user]:ml-auto">
      {isUser ? (
        <>
          {time}
          {copyButton}
          {onRewind ? (
            <MessageAction
              tooltip="Rewind to here"
              onClick={onRewind}
              className="size-6 rounded-md text-foreground/45 hover:text-foreground"
            >
              <RewindIcon />
            </MessageAction>
          ) : null}
          {forkButton}
          {onEdit ? (
            <MessageAction
              tooltip="Edit"
              onClick={onEdit}
              className="size-6 rounded-md text-foreground/45 hover:text-foreground"
            >
              <EditIcon />
            </MessageAction>
          ) : null}
        </>
      ) : (
        <>
          {copyButton}
          {forkButton}
          <MessageAction
            tooltip="Read aloud"
            onClick={() => speakAloud(message.content)}
            className="size-6 rounded-md text-foreground/45 hover:text-foreground"
          >
            <SpeakIcon />
          </MessageAction>
          {time}
        </>
      )}
    </MessageActions>
  );
}
