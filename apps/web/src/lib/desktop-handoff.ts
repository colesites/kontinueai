const DEEP_LINK_BASE = "kontinueai://auth/callback";
const CALLBACK_PORT = /^([1-9]\d{0,4})$/;

export function desktopHandoffTargets(
	state: string,
	ticket: string,
	callbackPort?: string,
) {
	const params = new URLSearchParams({ ticket, state }).toString();
	const deepLink = `${DEEP_LINK_BASE}?${params}`;
	const port =
		callbackPort && CALLBACK_PORT.test(callbackPort)
			? Number(callbackPort)
			: undefined;
	const loopback =
		port && port <= 65535 ? `http://127.0.0.1:${port}/?${params}` : null;
	return { deepLink, loopback };
}
