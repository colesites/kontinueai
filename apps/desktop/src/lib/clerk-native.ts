/**
 * Tauri's webview cannot keep Clerk's production cookies, so clerk-js must
 * run the same way @clerk/electron does: no cookies, client JWT on the
 * Authorization header, persisted in localStorage.
 *
 * clerk-react 5 loads clerk-js 5, whose hooks are still named __unstable__.
 * clerk-js 6 renamed them to __internal_. Both are wired.
 */

const CLIENT_JWT_KEY = "__clerk_client_jwt";

export type NativeFapiRequest = {
	credentials?: RequestCredentials;
	url?: URL;
	headers?: HeadersInit;
};

export type NativeFapiResponse = {
	headers?: { get(name: string): string | null };
};

type RequestHook = (request: NativeFapiRequest) => void;
type ResponseHook = (
	request: NativeFapiRequest,
	response: NativeFapiResponse,
) => void;

export type NativeClerkLike = {
	__unstable__onBeforeRequest?: (callback: RequestHook) => void;
	__unstable__onAfterResponse?: (callback: ResponseHook) => void;
	__internal_onBeforeRequest?: (callback: RequestHook) => void;
	__internal_onAfterResponse?: (callback: ResponseHook) => void;
};

function readClientJwt() {
	try {
		return localStorage.getItem(CLIENT_JWT_KEY);
	} catch {
		return null;
	}
}

function writeClientJwt(token: string) {
	try {
		localStorage.setItem(CLIENT_JWT_KEY, token);
	} catch {
		// Private mode or a full store. The in-memory session still works
		// until the webview reloads.
	}
}

export function applyNativeClerkRequest(request: NativeFapiRequest) {
	request.credentials = "omit";
	request.url?.searchParams.set("_is_native", "1");
	const token = readClientJwt();
	if (!token) return;
	const headers = new Headers(request.headers);
	headers.set(
		"Authorization",
		token.startsWith("Bearer ") ? token : `Bearer ${token}`,
	);
	request.headers = headers;
}

export function captureNativeClerkResponse(response: NativeFapiResponse) {
	const authorization = response.headers?.get("Authorization");
	if (!authorization) return;
	const token = authorization.startsWith("Bearer ")
		? authorization.slice("Bearer ".length)
		: authorization;
	if (token) writeClientJwt(token);
}

export function attachNativeClerkAuth(clerk: NativeClerkLike) {
	const before =
		clerk.__unstable__onBeforeRequest ?? clerk.__internal_onBeforeRequest;
	const after =
		clerk.__unstable__onAfterResponse ?? clerk.__internal_onAfterResponse;
	before?.((request) => applyNativeClerkRequest(request));
	after?.((_request, response) => captureNativeClerkResponse(response));
}
