import { SignUp } from "@clerk/nextjs";
import { clerkPostAuthRedirect } from "../../../../lib/auth-routing";
import { AuthScaffold } from "../../../../components/AuthScaffold";

export default async function SignUpPage({
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
		<AuthScaffold subtitle="Create an account to get started">
			<SignUp
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
