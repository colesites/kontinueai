"use client";

import type { Provider } from "@repo/utils/url-safety";
import Image from "next/image";
import { HowToButton } from "../../import/components/HowToButton";
import { HomeImportDialog } from "./HomeImportDialog";

type HomeIntroSectionProps = {
	firstName: string;
	importModalOpen: boolean;
	onImportModalOpenChange: (open: boolean) => void;
	importUrl: string;
	onImportUrlChange: (value: string) => void;
	importProvider: Provider;
	isImporting: boolean;
	onImport: () => void;
};

export function HomeIntroSection({
	firstName,
	importModalOpen,
	onImportModalOpenChange,
	importUrl,
	onImportUrlChange,
	importProvider,
	isImporting,
	onImport,
}: HomeIntroSectionProps) {
	return (
		<div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center px-4 text-center">
			<Image
				src="/kontinueai.svg"
				alt="Kontinue AI"
				width={48}
				height={48}
				priority
				className="h-11 w-auto invert dark:invert-0 transition-[filter] drop-shadow-[0_8px_28px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
			/>
			<h1 className="mt-7 text-balance text-3xl font-medium tracking-tight text-foreground/85 sm:text-[2.6rem] sm:leading-[1.1]">
				How can I help you,{" "}
				<span className="font-semibold text-foreground">{firstName}</span>?
			</h1>

			<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
				<HowToButton />
				<HomeImportDialog
					open={importModalOpen}
					onOpenChange={onImportModalOpenChange}
					importUrl={importUrl}
					onImportUrlChange={onImportUrlChange}
					importProvider={importProvider}
					isImporting={isImporting}
					onImport={onImport}
				/>
			</div>
		</div>
	);
}
