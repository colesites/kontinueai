import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { formatStars, getGitHubStars } from "@/lib/desktop-release";

export default async function LandingPageLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const stars = await getGitHubStars();
	return (
		<>
			<Header stars={stars === null ? null : formatStars(stars)} />
			<main className="min-h-screen">{children}</main>
			<Footer />
		</>
	);
}
