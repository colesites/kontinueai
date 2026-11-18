// The desktop app's installers live on GitHub Releases (built by the
// "Desktop release" workflows). This reads the latest published release so the
// site can link to the right file for each system, and adds up how many times
// the installers were downloaded across every release.
//
// Cached for 15 minutes. Set GITHUB_TOKEN to raise GitHub's rate limit (the
// repo is public, so any read-only token works).

import "server-only";

const REPO = "colesites/kontinueai";
const TAG_PREFIX = "desktop-v";
export const REPO_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${REPO_URL}/releases`;

export type DesktopPlatform =
	| "mac"
	| "windows"
	| "linux"
	| "linux-deb"
	| "linux-rpm";

/** Which release file each download link serves. */
const INSTALLERS: Record<DesktopPlatform, RegExp> = {
	mac: /_universal\.dmg$/,
	windows: /_x64-setup\.exe$/,
	linux: /\.AppImage$/,
	"linux-deb": /\.deb$/,
	"linux-rpm": /\.rpm$/,
};

/** Files people download to install (not update bundles, signatures or latest.json). */
const COUNTED = /(\.dmg|-setup\.exe|\.msi|\.AppImage|\.deb|\.rpm)$/;

type GitHubAsset = {
	name: string;
	browser_download_url: string;
	download_count: number;
	size: number;
};
type GitHubRelease = {
	tag_name: string;
	name: string | null;
	draft: boolean;
	prerelease: boolean;
	published_at: string | null;
	assets: GitHubAsset[];
};

export type DesktopRelease = {
	version: string;
	publishedAt: string | null;
	/** Direct GitHub file URL per platform (missing when that build isn't in the release). */
	files: Partial<Record<DesktopPlatform, { url: string; size: number }>>;
	/** Installer downloads across every desktop release. */
	totalDownloads: number;
};

export function isDesktopPlatform(value: string): value is DesktopPlatform {
	return value in INSTALLERS;
}

export async function getDesktopRelease(): Promise<DesktopRelease | null> {
	const headers: HeadersInit = {
		Accept: "application/vnd.github+json",
		"User-Agent": "kontinueai-website",
	};
	if (process.env.GITHUB_TOKEN)
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

	try {
		const response = await fetch(
			`https://api.github.com/repos/${REPO}/releases?per_page=100`,
			{
				headers,
				next: { revalidate: 900, tags: ["desktop-release"] },
			},
		);
		if (!response.ok) return null;
		const releases = ((await response.json()) as GitHubRelease[]).filter(
			(release) => !release.draft && release.tag_name.startsWith(TAG_PREFIX),
		);
		if (releases.length === 0) return null;

		const latest = [...releases].sort(
			(a, b) =>
				Date.parse(b.published_at ?? "0") - Date.parse(a.published_at ?? "0"),
		)[0];

		const files: DesktopRelease["files"] = {};
		for (const [platform, pattern] of Object.entries(INSTALLERS) as [
			DesktopPlatform,
			RegExp,
		][]) {
			const asset = latest.assets.find((item) => pattern.test(item.name));
			if (asset)
				files[platform] = { url: asset.browser_download_url, size: asset.size };
		}

		const totalDownloads = releases
			.flatMap((release) => release.assets)
			.filter((asset) => COUNTED.test(asset.name))
			.reduce((sum, asset) => sum + asset.download_count, 0);

		return {
			version: latest.tag_name.slice(TAG_PREFIX.length),
			publishedAt: latest.published_at,
			files,
			totalDownloads,
		};
	} catch {
		return null;
	}
}

/** 1234 → "1.2k", 20400 → "20k", 1500000 → "1.5M". */
export function formatDownloads(count: number): string {
	if (count < 1000) return String(count);
	if (count < 1_000_000) {
		const k = count / 1000;
		return `${k < 10 ? Math.floor(k * 10) / 10 : Math.floor(k)}k`;
	}
	const m = count / 1_000_000;
	return `${m < 10 ? Math.floor(m * 10) / 10 : Math.floor(m)}M`;
}

/** The count shows once there's at least one download. */
export const SHOW_DOWNLOADS_FROM = 1;

/** The repo's GitHub star count, cached for an hour (null if GitHub can't be reached). */
export async function getGitHubStars(): Promise<number | null> {
	const headers: HeadersInit = {
		Accept: "application/vnd.github+json",
		"User-Agent": "kontinueai-website",
	};
	if (process.env.GITHUB_TOKEN)
		headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
	try {
		const response = await fetch(`https://api.github.com/repos/${REPO}`, {
			headers,
			next: { revalidate: 3600, tags: ["github-stars"] },
		});
		if (!response.ok) return null;
		const repo = (await response.json()) as { stargazers_count?: number };
		return typeof repo.stargazers_count === "number"
			? repo.stargazers_count
			: null;
	} catch {
		return null;
	}
}

/** Star counts read like "57k+" past a thousand, exact below. */
export function formatStars(count: number): string {
	return count < 1000 ? String(count) : `${formatDownloads(count)}+`;
}
