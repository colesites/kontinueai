import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

export default function LandingPageLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<>
			<Header />
			<main className="min-h-screen">{children}</main>
			<Footer />
		</>
	);
}
