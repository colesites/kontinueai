import { api as convexApi } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";
import { fetchMutation } from "convex/nextjs";
import { isKodeComingSoon } from "../../../../features/kode/lib/availability";
import { getUserPlanTier } from "../../chat/lib/plan-limits";
import { getAuthContext } from "../../chat/lib/route-input";

export const maxDuration = 30;

function textAttachment(file: File): boolean {
	return (
		file.type.startsWith("text/") ||
		file.type === "application/json" ||
		file.type === "application/xml" ||
		file.type === "application/x-yaml" ||
		/\.(?:html?|css|js|jsx|ts|tsx|json|md|txt|xml|ya?ml|csv)$/i.test(file.name)
	);
}

async function buildAttachmentContext(files: File[]): Promise<string> {
	const sections: string[] = [];
	for (const file of files.slice(0, 5)) {
		if (!textAttachment(file)) {
			sections.push(
				`${file.name} (${file.type || "unknown type"}) was attached but is not a supported text file.`,
			);
			continue;
		}
		if (file.size > 2_000_000) {
			sections.push(`${file.name} was skipped because it exceeds 2 MB.`);
			continue;
		}
		sections.push(
			`--- ${file.name} ---\n${(await file.text()).slice(0, 45_000)}`,
		);
	}
	return sections.join("\n\n").slice(0, 250_000);
}

export async function POST(request: Request) {
	try {
		if (isKodeComingSoon(request.headers.get("host"))) {
			return Response.json({ error: "Kode is coming soon." }, { status: 503 });
		}
		const { userId, hasPlan, getToken } = await getAuthContext();
		if (!userId)
			return Response.json({ error: "Unauthorized" }, { status: 401 });
		if ((await getUserPlanTier(userId, hasPlan)) !== "pro") {
			return Response.json(
				{ error: "Kode is available exclusively on the Pro plan." },
				{ status: 403 },
			);
		}

		const convexToken = (await getToken?.({ template: "convex" })) ?? null;
		if (!convexToken) {
			return Response.json(
				{ error: "Your session could not be verified. Please sign in again." },
				{ status: 401 },
			);
		}

		const formData = await request.formData();
		const rawProjectId = formData.get("projectId");
		const rawPrompt = formData.get("prompt");
		const rawMode = formData.get("mode");
		if (
			typeof rawProjectId !== "string" ||
			typeof rawPrompt !== "string" ||
			(rawMode !== "build" && rawMode !== "plan")
		) {
			return Response.json(
				{ error: "projectId, prompt, and a valid mode are required." },
				{ status: 400 },
			);
		}

		const files = formData
			.getAll("files")
			.filter((value): value is File => typeof value !== "string");
		const queued = await fetchMutation(
			convexApi.kodeWeb.startBuild,
			{
				projectId: rawProjectId as Id<"kodeWebProjects">,
				prompt: rawPrompt.trim(),
				mode: rawMode,
				attachmentContext: await buildAttachmentContext(files),
			},
			{ token: convexToken },
		);

		return Response.json({ ...queued, status: "queued" }, { status: 202 });
	} catch (error) {
		console.error("[kode-web] queue failed", error);
		return Response.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Kode could not queue this job.",
			},
			{ status: 500 },
		);
	}
}
