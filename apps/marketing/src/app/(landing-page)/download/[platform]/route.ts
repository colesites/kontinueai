// kontinueai.com/download/mac (windows, linux, linux-deb, linux-rpm): sends
// the browser straight to the latest installer on GitHub Releases, so the
// download starts without leaving the page and links never change between
// versions. Falls back to the releases page if the file isn't found.

import { NextResponse } from "next/server";
import {
	getDesktopRelease,
	isDesktopPlatform,
	RELEASES_URL,
} from "@/lib/desktop-release";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ platform: string }> },
) {
	const { platform } = await params;
	const release = isDesktopPlatform(platform)
		? await getDesktopRelease()
		: null;
	const file =
		release && isDesktopPlatform(platform)
			? release.files[platform]
			: undefined;

	const response = NextResponse.redirect(
		file?.url ?? `${RELEASES_URL}/latest`,
		302,
	);
	// The target changes with each release; don't let browsers or CDNs keep it.
	response.headers.set("Cache-Control", "no-store");
	return response;
}
