import { gateway } from "@ai-sdk/gateway-realtime";

export const getRealtimeToken = (options) =>
	gateway.experimental_realtime.getToken(options);
