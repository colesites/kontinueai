import { SignUp } from "@clerk/nextjs";
import { AuthScaffold } from "../../../../components/AuthScaffold";

export default function SignUpPage() {
	return (
		<AuthScaffold subtitle="Create an account to get started">
			<SignUp
				appearance={{
					elements: {
						rootBox: "mx-auto",
					},
				}}
			/>
		</AuthScaffold>
	);
}
