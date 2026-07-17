import { useAuth } from "@clerk/expo";
import * as Clipboard from "expo-clipboard";
import { type Href, useRouter } from "expo-router";
import {
  AlertCircle,
  Check,
  Copy,
  Mail,
  Pencil,
  Send,
} from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, TextInput, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { useTheme } from "@/components/theme-provider";
import { API_BASE_URL } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

export type EmailDraft = {
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
  const { mutedForeground, primaryForeground } = useTheme();
  const router = useRouter();
  const { getToken } = useAuth();
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sendState, setSendState] = useState<SendState>({ status: "idle" });

  const sent = sendState.status === "sent";
  const sending = sendState.status === "sending";
  const locked = sent || sending;

  const copy = async () => {
    await Clipboard.setStringAsync(
      `To: ${to}${cc ? `\nCc: ${cc}` : ""}\nSubject: ${subject}\n\n${body}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const send = async () => {
    if (!to.trim()) {
      setSendState({ status: "error", message: "Add at least one recipient." });
      return;
    }
    setSendState({ status: "sending" });
    try {
      const token = await getToken();
      if (!token) throw new Error("Your session could not be verified.");
      const response = await fetch(
        `${API_BASE_URL}/api/connectors/gmail/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ to, cc, subject, body }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        needsReconnect?: boolean;
      };
      if (!response.ok || !result.ok) {
        setSendState({
          status: "error",
          message: result.error ?? "Couldn't send the email.",
          needsReconnect: result.needsReconnect,
        });
        return;
      }
      setEditing(false);
      setSendState({ status: "sent" });
    } catch (error) {
      setSendState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Network error. Try again.",
      });
    }
  };

  const fieldClass = cn(
    "min-h-11 flex-1 px-3 py-2 text-[13px] text-foreground",
    !editing && "text-muted-foreground",
  );

  return (
    <View
      className={cn(
        "mt-3 w-full min-w-72 overflow-hidden rounded-2xl border bg-secondary/60",
        sent ? "border-emerald-500/35" : "border-border",
      )}
    >
      <View className="min-h-12 flex-row items-center gap-2 border-b border-border px-3">
        <View
          className={cn(
            "h-7 w-7 items-center justify-center rounded-lg",
            sent ? "bg-emerald-500/15" : "bg-primary/12",
          )}
        >
          <Icon
            as={sent ? Check : Mail}
            size={13}
            className={sent ? "text-emerald-500" : "text-primary"}
          />
        </View>
        <Text className="flex-1 text-[12.5px] font-semibold text-foreground">
          {sent ? "Email sent" : "Draft email"}
        </Text>
        {!locked ? (
          <>
            <Pressable
              accessibilityLabel="Copy email"
              onPress={() => void copy()}
              className="h-11 w-11 items-center justify-center rounded-xl active:bg-foreground/5"
            >
              <Icon
                as={copied ? Check : Copy}
                size={14}
                className={
                  copied ? "text-emerald-500" : "text-muted-foreground"
                }
              />
            </Pressable>
            <Pressable
              accessibilityLabel={
                editing ? "Finish editing email" : "Edit email"
              }
              onPress={() => setEditing((current) => !current)}
              className={cn(
                "min-h-10 flex-row items-center gap-1.5 rounded-xl px-2.5",
                editing ? "bg-primary/12" : "active:bg-foreground/5",
              )}
            >
              <Icon as={Pencil} size={13} className="text-primary" />
              <Text className="text-[11.5px] font-semibold text-primary">
                {editing ? "Done" : "Edit"}
              </Text>
            </Pressable>
          </>
        ) : null}
      </View>

      <EmailRow label="To">
        <TextInput
          value={to}
          onChangeText={setTo}
          editable={editing && !locked}
          placeholder="name@example.com"
          placeholderTextColor={mutedForeground}
          autoCapitalize="none"
          keyboardType="email-address"
          className={fieldClass}
        />
      </EmailRow>
      {(editing || cc) && (
        <EmailRow label="Cc">
          <TextInput
            value={cc}
            onChangeText={setCc}
            editable={editing && !locked}
            placeholder="Optional"
            placeholderTextColor={mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            className={fieldClass}
          />
        </EmailRow>
      )}
      <EmailRow label="Subject">
        <TextInput
          value={subject}
          onChangeText={setSubject}
          editable={editing && !locked}
          placeholder="Subject"
          placeholderTextColor={mutedForeground}
          className={fieldClass}
        />
      </EmailRow>
      <TextInput
        value={body}
        onChangeText={setBody}
        editable={editing && !locked}
        multiline
        textAlignVertical="top"
        placeholder="Write your message…"
        placeholderTextColor={mutedForeground}
        className={cn(fieldClass, "min-h-28 border-t border-border")}
      />

      <View className="min-h-14 flex-row items-center gap-2 border-t border-border px-3 py-2">
        {sendState.status === "error" ? (
          <View className="min-w-0 flex-1 flex-row items-center gap-1.5">
            <Icon as={AlertCircle} size={14} className="text-destructive" />
            <Text
              numberOfLines={2}
              className="flex-1 text-[11px] text-destructive"
            >
              {sendState.message}
            </Text>
            {sendState.needsReconnect ? (
              <Pressable
                onPress={() => router.push("/connectors" as Href)}
                className="min-h-10 justify-center px-1"
              >
                <Text className="text-[11px] font-semibold text-primary">
                  Reconnect
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          <Text
            numberOfLines={1}
            className={cn(
              "min-w-0 flex-1 text-[11px]",
              sent ? "text-emerald-500" : "text-muted-foreground",
            )}
          >
            {sent ? "Delivered via Gmail" : "Review, then send from your Gmail"}
          </Text>
        )}
        {!sent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send email with Gmail"
            disabled={sending}
            onPress={() => void send()}
            className="min-h-11 flex-row items-center gap-2 rounded-xl bg-primary px-4 disabled:opacity-60"
          >
            {sending ? (
              <ActivityIndicator size="small" color={primaryForeground} />
            ) : (
              <Icon as={Send} size={14} className="text-primary-foreground" />
            )}
            <Text className="text-[12px] font-semibold text-primary-foreground">
              {sending ? "Sending" : "Send"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function EmailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="min-h-11 flex-row items-center border-b border-border px-3">
      <Text className="w-14 text-[11.5px] font-medium text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}
