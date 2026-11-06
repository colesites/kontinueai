import { SignIn } from "@clerk/nextjs";
import { clerkPostAuthRedirect } from "../../../../lib/auth-routing";
import { AuthScaffold } from "../../../../components/AuthScaffold";

export default async function SignInPage({
	searchParams,
}: {
	searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
	const params = await searchParams;
	const desktopReturn = clerkPostAuthRedirect(
		params.redirect_url,
		process.env.NEXT_PUBLIC_APP_URL ?? "https://chat.kontinueai.com",
	);

	return (
		<AuthScaffold subtitle="Sign in to continue your AI conversations">
			<SignIn
				fallbackRedirectUrl="/"
				{...(desktopReturn ? { forceRedirectUrl: desktopReturn } : {})}
				appearance={{
					elements: {
						rootBox: "mx-auto",
					},
				}}
			/>
		</AuthScaffold>
	);
}
