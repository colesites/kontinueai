"use client";

import { gateway } from "@ai-sdk/gateway-realtime";
import { experimental_useRealtime } from "@ai-sdk/react-realtime";

export const createRealtimeModel = (modelId) =>
	gateway.experimental_realtime(modelId);

export const useRealtime = experimental_useRealtime;
