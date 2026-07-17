import { useAuth, useUser } from "@clerk/expo";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { REALTIME_VOICE_LIMITS } from "@repo/core/realtime-voice";
import { useMutation, useQuery } from "convex/react";
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlaylist,
  useAudioPlaylistStatus,
  useAudioStream,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, type Href } from "expo-router";
import {
  AudioLines,
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  Volume2,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/components/theme-provider";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { usePlanTier } from "@/hooks/use-plan-tier";
import { API_BASE_URL } from "@/lib/chat-api";
import { cn } from "@/lib/utils";

type VoiceSessionId = Id<"realtimeVoiceSessions">;
type LiveStatus = "idle" | "connecting" | "connected" | "error";
type TranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type RealtimeSetup = {
  token?: string;
  url?: string;
  error?: string;
};

type RealtimeEvent = {
  type?: string;
  itemId?: string;
  delta?: string;
  transcript?: string;
  text?: string;
  message?: string;
};

const OUTPUT_SAMPLE_RATE = 24_000;
const FIRST_PLAYBACK_BYTES = OUTPUT_SAMPLE_RATE;
const CONTINUOUS_PLAYBACK_BYTES = OUTPUT_SAMPLE_RATE * 4;

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  const data = (error as { data?: { message?: string } } | null)?.data;
  return data?.message?.trim() || fallback;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1] ?? 0;
    const third = bytes[index + 2] ?? 0;
    const triplet = (first << 16) | (second << 8) | third;
    output += alphabet[(triplet >> 18) & 63];
    output += alphabet[(triplet >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(triplet >> 6) & 63] : "=";
    output += index + 2 < bytes.length ? alphabet[triplet & 63] : "=";
  }
  return output;
}

function base64ToBytes(value: string): Uint8Array {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const output = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outputIndex = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const a = alphabet.indexOf(clean[index] ?? "A");
    const b = alphabet.indexOf(clean[index + 1] ?? "A");
    const c = alphabet.indexOf(clean[index + 2] ?? "A");
    const d = alphabet.indexOf(clean[index + 3] ?? "A");
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;
    output[outputIndex++] = (triplet >> 16) & 255;
    if (index + 2 < clean.length) output[outputIndex++] = (triplet >> 8) & 255;
    if (index + 3 < clean.length) output[outputIndex++] = triplet & 255;
  }
  return output.subarray(0, outputIndex);
}

function resamplePcm16(data: ArrayBuffer, sourceRate: number): Uint8Array {
  const source = new Int16Array(data);
  if (sourceRate === OUTPUT_SAMPLE_RATE) {
    return new Uint8Array(data);
  }
  const length = Math.max(
    1,
    Math.round(source.length * (OUTPUT_SAMPLE_RATE / sourceRate)),
  );
  const output = new Int16Array(length);
  const ratio = sourceRate / OUTPUT_SAMPLE_RATE;
  for (let index = 0; index < length; index += 1) {
    const sourcePosition = index * ratio;
    const before = Math.floor(sourcePosition);
    const after = Math.min(before + 1, source.length - 1);
    const weight = sourcePosition - before;
    output[index] = Math.round(
      (source[before] ?? 0) * (1 - weight) + (source[after] ?? 0) * weight,
    );
  }
  return new Uint8Array(output.buffer);
}

function pcmToWav(pcm: Uint8Array): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, OUTPUT_SAMPLE_RATE, true);
  view.setUint32(28, OUTPUT_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatAllowance(seconds: number): string {
  if (seconds >= 3600) {
    const hours = seconds / 3600;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  return `${Math.ceil(seconds / 60)}m`;
}

export default function LiveVoiceScreen() {
  const router = useRouter();
  const { primary } = useTheme();
  const { getToken } = useAuth();
  const { user } = useUser();
  const planTier = usePlanTier();
  const canUseLive = planTier === "pro" || planTier === "max";
  const allowance = useQuery(api.realtimeVoice.getAllowance, {});
  const startSession = useMutation(api.realtimeVoice.startSession);
  const meterSession = useMutation(api.realtimeVoice.meterSession);
  const finishSession = useMutation(api.realtimeVoice.endSession);
  const playlist = useAudioPlaylist({ sources: [], updateInterval: 100 });
  const playback = useAudioPlaylistStatus(playlist);
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [sessionId, setSessionId] = useState<VoiceSessionId | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [sessionCap, setSessionCap] = useState(
    REALTIME_VOICE_LIMITS[planTier].maxSessionSeconds,
  );
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const websocketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<VoiceSessionId | null>(null);
  const mutedRef = useRef(false);
  const streamStartedRef = useRef(false);
  const audioChunksRef = useRef<Uint8Array[]>([]);
  const audioBytesRef = useRef(0);
  const audioFilesRef = useRef<File[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const [pulse] = useState(() => new Animated.Value(0));

  const audioStream = useAudioStream({
    sampleRate: OUTPUT_SAMPLE_RATE,
    channels: 1,
    encoding: "int16",
    onBuffer: (buffer) => {
      const websocket = websocketRef.current;
      if (
        mutedRef.current ||
        !websocket ||
        websocket.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      const pcm = resamplePcm16(buffer.data, buffer.sampleRate);
      websocket.send(
        JSON.stringify({
          type: "input-audio-append",
          audio: bytesToBase64(pcm),
        }),
      );
    },
  });

  const cleanupAudio = useCallback(() => {
    playlist.pause();
    playlist.clear();
    audioChunksRef.current = [];
    audioBytesRef.current = 0;
    for (const file of audioFilesRef.current) {
      try {
        if (file.exists) file.delete();
      } catch {
        // Cache cleanup is best effort; the OS will also purge this directory.
      }
    }
    audioFilesRef.current = [];
  }, [playlist]);

  const flushPlayback = useCallback(() => {
    if (audioBytesRef.current === 0) return;
    const pcm = new Uint8Array(audioBytesRef.current);
    let offset = 0;
    for (const chunk of audioChunksRef.current) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    audioChunksRef.current = [];
    audioBytesRef.current = 0;

    const file = new File(
      Paths.cache,
      `kontinue-live-${Date.now()}-${audioFilesRef.current.length}.wav`,
    );
    file.create({ overwrite: true });
    file.write(pcmToWav(pcm));
    audioFilesRef.current.push(file);
    playlist.add(file.uri);
    playlist.play();
  }, [playlist]);

  const appendTranscript = useCallback(
    (
      role: TranscriptMessage["role"],
      id: string,
      text: string,
      final: boolean,
    ) => {
      if (!text) return;
      setMessages((current) => {
        const existing = current.findIndex((message) => message.id === id);
        if (existing < 0) {
          return [...current, { id, role, text }].slice(-8);
        }
        const next = [...current];
        const previous = next[existing];
        if (!previous) return current;
        next[existing] = {
          ...previous,
          text: final ? text : `${previous.text}${text}`,
        };
        return next;
      });
    },
    [],
  );

  const stopSpeaking = useCallback(() => {
    playlist.pause();
    websocketRef.current?.send(JSON.stringify({ type: "response-cancel" }));
    cleanupAudio();
  }, [cleanupAudio, playlist]);

  const endLiveSession = useCallback(async () => {
    const activeSession = sessionIdRef.current;
    sessionIdRef.current = null;
    websocketRef.current?.close();
    websocketRef.current = null;
    if (streamStartedRef.current) {
      audioStream.stream.stop();
      streamStartedRef.current = false;
    }
    cleanupAudio();
    startedAtRef.current = null;
    setSessionId(null);
    setStatus("idle");
    setElapsed(0);
    setIsMuted(false);
    mutedRef.current = false;
    if (activeSession) {
      try {
        await finishSession({ sessionId: activeSession });
      } catch {
        // The server may already have closed a metered or expired session.
      }
    }
  }, [audioStream.stream, cleanupAudio, finishSession]);

  const handleRealtimeEvent = useCallback(
    async (event: RealtimeEvent) => {
      switch (event.type) {
        case "session-created":
        case "session-updated":
          setStatus("connected");
          if (!streamStartedRef.current) {
            streamStartedRef.current = true;
            await audioStream.stream.start();
            startedAtRef.current = Date.now();
          }
          break;
        case "audio-delta": {
          if (!event.delta) break;
          const bytes = base64ToBytes(event.delta);
          audioChunksRef.current.push(bytes);
          audioBytesRef.current += bytes.length;
          const target =
            playlist.trackCount === 0
              ? FIRST_PLAYBACK_BYTES
              : CONTINUOUS_PLAYBACK_BYTES;
          if (audioBytesRef.current >= target) flushPlayback();
          break;
        }
        case "audio-done":
        case "response-done":
          flushPlayback();
          break;
        case "audio-transcript-delta":
          appendTranscript(
            "assistant",
            `assistant-${event.itemId ?? "current"}`,
            event.delta ?? "",
            false,
          );
          break;
        case "audio-transcript-done":
          appendTranscript(
            "assistant",
            `assistant-${event.itemId ?? "current"}`,
            event.transcript ?? "",
            true,
          );
          break;
        case "input-transcription-completed":
          appendTranscript(
            "user",
            `user-${event.itemId ?? Date.now()}`,
            event.transcript ?? "",
            true,
          );
          break;
        case "speech-started":
          if (playlist.playing) stopSpeaking();
          break;
        case "error":
          setStatus("error");
          setErrorMessage(event.message || "Live voice encountered an error.");
          break;
      }
    },
    [
      appendTranscript,
      audioStream.stream,
      flushPlayback,
      playlist,
      stopSpeaking,
    ],
  );

  const begin = async () => {
    if (!canUseLive || status === "connecting") return;
    setStatus("connecting");
    setErrorMessage(null);
    setMessages([]);
    cleanupAudio();
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone access is required for Kontinue Live.");
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
      const session = await startSession({});
      sessionIdRef.current = session.sessionId;
      setSessionId(session.sessionId);
      setRemainingSeconds(session.remainingSeconds);
      setSessionCap(session.maxSessionSeconds);

      const clerkToken = await getToken();
      if (!clerkToken) throw new Error("Your session could not be verified.");
      const response = await fetch(
        `${API_BASE_URL}/api/realtime/token?sessionId=${encodeURIComponent(session.sessionId)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${clerkToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const setup = (await response.json()) as RealtimeSetup;
      if (!response.ok || !setup.token || !setup.url) {
        throw new Error(setup.error || "Live voice could not connect.");
      }

      const websocket = new WebSocket(setup.url, [
        "ai-gateway-realtime.v1",
        `ai-gateway-auth.${setup.token}`,
      ]);
      websocketRef.current = websocket;
      websocket.onopen = () => {
        websocket.send(
          JSON.stringify({
            type: "session-update",
            config: {
              voice: planTier === "max" ? "marin" : "alloy",
              outputModalities: ["audio"],
              inputAudioFormat: { type: "audio/pcm", rate: OUTPUT_SAMPLE_RATE },
              outputAudioFormat: {
                type: "audio/pcm",
                rate: OUTPUT_SAMPLE_RATE,
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              turnDetection: { type: "server-vad" },
              tools: [],
              instructions:
                "You are Kontinue Live, a warm, capable voice assistant. Speak naturally and concisely. Let the user interrupt. Never mention internal model or provider details.",
            },
          }),
        );
      };
      websocket.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as RealtimeEvent;
          void handleRealtimeEvent(event);
        } catch {
          // Ignore malformed provider frames without terminating the session.
        }
      };
      websocket.onerror = () => {
        setStatus("error");
        setErrorMessage("The live voice connection was interrupted.");
        void endLiveSession();
      };
      websocket.onclose = () => {
        if (sessionIdRef.current) setStatus("error");
      };
    } catch (error) {
      const message = errorText(error, "Live voice could not start.");
      setStatus("error");
      setErrorMessage(message);
      const activeSession = sessionIdRef.current;
      sessionIdRef.current = null;
      setSessionId(null);
      if (activeSession) {
        try {
          await finishSession({ sessionId: activeSession });
        } catch {
          // Preserve the original connection error.
        }
      }
    }
  };

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  useEffect(() => {
    if (status !== "connected" || !sessionId) return;
    const tick = setInterval(() => {
      if (startedAtRef.current) {
        const nextElapsed = Math.floor(
          (Date.now() - startedAtRef.current) / 1000,
        );
        setElapsed(nextElapsed);
        if (nextElapsed >= sessionCap) {
          setErrorMessage("This live session reached its time limit.");
          void endLiveSession();
        }
      }
    }, 1000);
    const heartbeat = setInterval(() => {
      void meterSession({ sessionId })
        .then((result) => {
          setRemainingSeconds(result.remainingSeconds);
          if (!result.allowed) {
            setErrorMessage(
              result.remainingSeconds === 0
                ? "Your monthly live voice allowance is used up."
                : "This live session reached its time limit.",
            );
            void endLiveSession();
          }
        })
        .catch((error) => {
          setErrorMessage(errorText(error, "Voice metering failed."));
          void endLiveSession();
        });
    }, 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
    };
  }, [endLiveSession, meterSession, sessionCap, sessionId, status]);

  useEffect(
    () => () => {
      websocketRef.current?.close();
      if (streamStartedRef.current) audioStream.stream.stop();
      const activeSession = sessionIdRef.current;
      if (activeSession) void finishSession({ sessionId: activeSession });
      for (const file of audioFilesRef.current) {
        try {
          if (file.exists) file.delete();
        } catch {
          // Best-effort cache cleanup.
        }
      }
    },
    [audioStream.stream, finishSession],
  );

  const toggleMute = () => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
  };

  const fallbackAllowance = REALTIME_VOICE_LIMITS[planTier];
  const shownRemaining =
    remainingSeconds ??
    allowance?.remainingSeconds ??
    fallbackAllowance.monthlySeconds;
  const speaking = playback.playing;
  const statusLabel = errorMessage
    ? "Connection paused"
    : status === "connecting"
      ? "Opening a quiet channel…"
      : speaking
        ? "Kontinue is speaking"
        : status === "connected"
          ? isMuted
            ? "Microphone muted"
            : "Listening"
          : `Hi ${user?.firstName?.trim() || "there"}, what's on your mind?`;
  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, status === "connected" ? 1.04 : 1],
  });

  return (
    <SafeAreaView
      className="flex-1 justify-end bg-black/60"
      edges={["top", "right", "bottom", "left"]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Kontinue Live"
        className="absolute inset-0"
        onPress={() => router.back()}
      />
      <View className="h-[94%] overflow-hidden rounded-t-[32px] border border-b-0 border-foreground/10 bg-background">
        <LinearGradient
          pointerEvents="none"
          colors={[`${primary}24`, `${primary}08`, "transparent"]}
          locations={[0, 0.45, 1]}
          className="absolute inset-x-0 top-0 h-64"
        />
        <View className="h-16 flex-row items-center justify-between border-b border-foreground/8 px-5">
          <View className="flex-row items-center gap-2.5">
            <View className="h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Icon as={AudioLines} size={17} className="text-primary" />
            </View>
            <View>
              <Text className="text-[15px] font-semibold text-foreground">Kontinue Live</Text>
              <Text className="text-[10.5px] text-muted-foreground">Realtime voice conversation</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close Kontinue Live"
            onPress={() => router.back()}
            className="h-11 w-11 items-center justify-center rounded-full border border-foreground/8 bg-foreground/5 active:bg-foreground/10"
          >
            <Icon as={X} size={18} className="text-muted-foreground" />
          </Pressable>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="flex-grow px-5 pb-10"
          showsVerticalScrollIndicator={false}
        >
        <View className="flex-1 items-center justify-center py-8">
          <View className="mb-7 flex-row items-center gap-2 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5">
            <View
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                status === "connected"
                  ? "bg-primary"
                  : "bg-muted-foreground/35",
              )}
            />
            <Text className="text-[10.5px] font-semibold uppercase tracking-widest text-primary">
              {planTier === "max"
                ? "Max voice"
                : planTier === "pro"
                  ? "Pro voice"
                  : "Voice preview"}
            </Text>
          </View>

          <Animated.View style={{ transform: [{ scale: pulseScale }] }}>
            <LinearGradient
              colors={[`${primary}80`, primary, `${primary}A6`]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              className="h-32 w-64 items-center justify-center rounded-full"
              style={{
                shadowColor: primary,
                shadowOpacity: status === "connected" ? 0.55 : 0.3,
                shadowRadius: 28,
                shadowOffset: { width: 0, height: 10 },
                elevation: 12,
              }}
            >
              <View className="h-[118px] w-[246px] items-center justify-center rounded-full border border-white/20 bg-black/20">
                <Icon as={speaking ? Volume2 : AudioLines} size={34} className="text-primary-foreground" />
              </View>
            </LinearGradient>
          </Animated.View>

          <Text className="mt-9 max-w-sm text-center text-[27px] font-semibold leading-8 tracking-tight text-foreground">
            {statusLabel}
          </Text>
          <Text className="mt-2 max-w-sm text-center text-[13px] leading-5 text-muted-foreground">
            {errorMessage ||
              (messages.at(-1)?.text
                ? messages.at(-1)?.text
                : "A natural spoken conversation. You can interrupt at any time.")}
          </Text>

          {status === "connected" && messages.length > 0 ? (
            <View className="mt-6 w-full max-w-md gap-2 rounded-2xl border border-border bg-card/70 p-4">
              {messages.slice(-3).map((message) => (
                <Text
                  key={message.id}
                  numberOfLines={2}
                  className="text-[12px] leading-5 text-muted-foreground"
                >
                  <Text className="font-semibold text-foreground">
                    {message.role === "assistant" ? "Kontinue  " : "You  "}
                  </Text>
                  {message.text}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        {!canUseLive ? (
          <View className="rounded-2xl border border-border bg-card p-5">
            <View className="flex-row items-center gap-2">
              <Icon as={Sparkles} size={18} className="text-primary" />
              <Text className="text-[16px] font-semibold text-foreground">
                Kontinue Live starts on Pro
              </Text>
            </View>
            <Text className="mt-2 text-[13px] leading-5 text-muted-foreground">
              Upgrade for natural, interruptible speech-to-speech conversations.
            </Text>
            <Pressable
              onPress={() => router.push("/pricing" as Href)}
              className="mt-4 min-h-12 items-center justify-center rounded-full bg-primary active:opacity-90"
            >
              <Text className="text-[13px] font-semibold text-primary-foreground">
                See plans
              </Text>
            </Pressable>
          </View>
        ) : status === "idle" || status === "error" ? (
          <View className="items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start live voice conversation"
              disabled={shownRemaining <= 0}
              onPress={() => void begin()}
              className="min-h-14 w-full max-w-md flex-row items-center justify-center gap-2.5 rounded-full bg-primary px-6 active:opacity-90 disabled:opacity-45"
            >
              <Icon as={Mic} size={20} className="text-primary-foreground" />
              <Text className="text-[14px] font-semibold text-primary-foreground">
                {shownRemaining <= 0
                  ? "Monthly limit reached"
                  : errorMessage
                    ? "Try again"
                    : "Start talking"}
              </Text>
            </Pressable>
            <Text className="mt-3 text-[11px] text-muted-foreground">
              {formatAllowance(shownRemaining)} remaining this month
            </Text>
          </View>
        ) : status === "connecting" ? (
          <View className="min-h-14 w-full max-w-md self-center items-center justify-center rounded-full border border-border bg-card">
            <Text className="text-[13px] font-medium text-muted-foreground">
              Connecting securely…
            </Text>
          </View>
        ) : (
          <View className="items-center">
            <View className="flex-row items-center gap-3 rounded-full border border-border bg-card p-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isMuted ? "Unmute microphone" : "Mute microphone"
                }
                onPress={toggleMute}
                className={cn(
                  "h-12 w-12 items-center justify-center rounded-full",
                  isMuted ? "bg-destructive/15" : "bg-secondary",
                )}
              >
                <Icon
                  as={isMuted ? MicOff : Mic}
                  size={19}
                  className={isMuted ? "text-destructive" : "text-foreground"}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop Kontinue speaking"
                onPress={stopSpeaking}
                className="h-12 w-12 items-center justify-center rounded-full bg-secondary"
              >
                <Icon as={Volume2} size={19} className="text-foreground" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="End live voice conversation"
                onPress={() => void endLiveSession()}
                className="h-14 w-14 items-center justify-center rounded-full bg-destructive active:opacity-90"
              >
                <Icon as={PhoneOff} size={21} className="text-white" />
              </Pressable>
            </View>
            <View className="mt-3 flex-row items-center gap-2">
              <Text className="text-[10.5px] text-muted-foreground">
                {formatTime(elapsed)}
              </Text>
              <View className="h-1 w-1 rounded-full bg-muted-foreground/30" />
              <Text className="text-[10.5px] text-muted-foreground">
                Audio is processed live
              </Text>
            </View>
          </View>
        )}

        {status === "idle" ? (
          <Text className="mt-3 text-center text-[10.5px] text-muted-foreground/70">
            Up to {formatAllowance(sessionCap)} per session
          </Text>
        ) : null}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
