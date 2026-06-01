import { fetchMutation } from "convex/nextjs";
import { api } from "@repo/convex/convex/_generated/api";
import type { Id } from "@repo/convex/convex/_generated/dataModel";

// Progress/result callback from the Render long-video worker. Guarded by the
// shared AGENT_TASK_SECRET; forwards into the Convex job row.
export async function POST(req: Request) {
  const secret = process.env.AGENT_TASK_SECRET;
  if (!secret || req.headers.get("x-agent-secret") !== secret) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: {
    jobId?: string;
    status?: "processing" | "completed" | "failed";
    progress?: number;
    stage?: string;
    finalUrl?: string;
    error?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!body.jobId) {
    return Response.json({ error: "Missing jobId" }, { status: 400 });
  }
  try {
    await fetchMutation(api.videoJobs.reportProgress, {
      jobId: body.jobId as Id<"videoJobs">,
      secret,
      status: body.status,
      progress: body.progress,
      stage: body.stage,
      finalUrl: body.finalUrl,
      error: body.error,
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[video-job/callback] failed", error);
    return Response.json({ error: "Update failed" }, { status: 500 });
  }
}
