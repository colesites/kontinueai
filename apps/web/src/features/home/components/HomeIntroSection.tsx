"use client";

import Image from "next/image";
import { HowToButton } from "../../import/components/HowToButton";
import { type Provider } from "@repo/utils/url-safety";
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
        className="h-10 w-auto invert dark:invert-0 transition-[filter]"
      />
      <h1 className="mt-6 text-2xl font-normal tracking-wide text-foreground/90 sm:text-3xl">
        How can I help you, {firstName}?
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
