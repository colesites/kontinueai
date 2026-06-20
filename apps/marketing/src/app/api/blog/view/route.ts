import { type NextRequest, NextResponse } from "next/server";
import { writeClient } from "@/sanity/lib/writeClient";

// Increments a post's view counter. Deduped per browser via a short-lived
// cookie so a refresh doesn't inflate the count. No-ops without a write token.
export async function POST(req: NextRequest) {
	if (!process.env.SANITY_API_WRITE_TOKEN) {
		return NextResponse.json({ ok: false, reason: "no-write-token" });
	}

	const body = (await req.json().catch(() => null)) as { slug?: string } | null;
	const slug = body?.slug;
	if (!slug || typeof slug !== "string") {
		return NextResponse.json(
			{ ok: false, reason: "missing-slug" },
			{
				status: 400,
			},
		);
	}

	const cookieName = `kv_${slug}`.slice(0, 60);
	if (req.cookies.get(cookieName)) {
		return NextResponse.json({ ok: true, deduped: true });
	}

	try {
		await writeClient
			.patch({
				query: '*[_type == "post" && slug.current == $slug]',
				params: { slug },
			})
			.setIfMissing({ views: 0 })
			.inc({ views: 1 })
			.commit();
	} catch {
		return NextResponse.json(
			{ ok: false, reason: "write-failed" },
			{
				status: 500,
			},
		);
	}

	const res = NextResponse.json({ ok: true });
	res.cookies.set(cookieName, "1", {
		maxAge: 60 * 60 * 6, // 6 hours
		httpOnly: true,
		sameSite: "lax",
		path: "/",
	});
	return res;
}
