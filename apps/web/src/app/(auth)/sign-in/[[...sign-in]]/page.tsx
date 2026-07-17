import { SignIn } from "@clerk/nextjs";
import { AuthScaffold } from "../../../../components/AuthScaffold";

export default function SignInPage() {
	return (
		<AuthScaffold subtitle="Sign in to continue your AI conversations">
			<SignIn
				appearance={{
					elements: {
						rootBox: "mx-auto",
					},
				}}
			/>
		</AuthScaffold>
	);
}
