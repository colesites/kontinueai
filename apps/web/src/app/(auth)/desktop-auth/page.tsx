import { auth, currentUser } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { AuthScaffold } from "../../../components/AuthScaffold";
import { DesktopAuthHandoff } from "./DesktopAuthHandoff";
import { DesktopAuthRedirect } from "./DesktopAuthRedirect";
// The desktop app sends 32 random bytes as hex.
const STATE_PATTERN = /^[a-f0-9]{64}$/;

export default async function DesktopAuthPage({
	searchParams,
}: {
	searchParams: Promise<{
		state?: string | string[];
		mode?: string | string[];
		callback_port?: string | string[];
	}>;
}) {
	// This route reads the signed-in user and then redirects. Without a
	// request-time boundary, the cached shell is the 404 page.
	await connection();
	const { state: rawState, mode: rawMode, callback_port: rawPort } = await searchParams;
	const state = typeof rawState === "string" ? rawState : undefined;
	const mode = rawMode === "sign-up" ? "sign-up" : "sign-in";
	const callbackPort = typeof rawPort === "string" && /^\d+$/.test(rawPort) ? rawPort : undefined;

	if (!state || !STATE_PATTERN.test(state)) {
		return (
			<AuthScaffold subtitle="Kontinue AI desktop sign-in">
				<div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
					This sign-in link is invalid or incomplete. Go back to the Kontinue AI
					desktop app and click <strong>Log in</strong> again.
				</div>
			</AuthScaffold>
		);
	}

	const returnTo = `/desktop-auth?state=${state}&mode=${mode}${callbackPort ? `&callback_port=${callbackPort}` : ""}`;
	const { userId } = await auth();
	if (!userId) {
		const authPath = mode === "sign-up" ? "/sign-up" : "/sign-in";
		const href = `${authPath}?redirect_url=${encodeURIComponent(returnTo)}`;
		return (
			<AuthScaffold subtitle="Kontinue AI desktop sign-in">
				<DesktopAuthRedirect href={href} />
			</AuthScaffold>
		);
	}

	const user = await currentUser();
	const email =
		user?.primaryEmailAddress?.emailAddress ??
		user?.emailAddresses[0]?.emailAddress ??
		null;

	return (
		<AuthScaffold subtitle="Sign in to the Kontinue AI desktop app">
			<DesktopAuthHandoff
				state={state}
				email={email}
				returnTo={returnTo}
				callbackPort={callbackPort}
			/>
		</AuthScaffold>
	);
}
