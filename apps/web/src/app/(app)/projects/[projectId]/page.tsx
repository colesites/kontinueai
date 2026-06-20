import { Suspense } from "react";
import Spinner from "../../../../components/Spinner";
import { ProjectClient } from "../../../../features/projects/components/ProjectClient";

// Required for Cache Components - provide at least one param for validation
export async function generateStaticParams() {
	return [{ projectId: "placeholder" }];
}

export default function ProjectPage() {
	return (
		<Suspense fallback={<Spinner />}>
			<ProjectClient />
		</Suspense>
	);
}
