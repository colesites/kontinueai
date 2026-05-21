"use client";

import { PricingTable } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function PricingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 flex flex-col items-center p-6">
      <div className="w-full max-w-6xl py-8 sm:py-12">
        {/* Premium Header */}
        <div className="text-center mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-primary">
            Pricing
          </h2>
          <p className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            Pick the right plan for your workflow
          </p>
          <p className="mt-4 text-base text-muted-foreground max-w-2xl mx-auto font-medium">
            Continue your conversations across any platform with powerful tools
            and unlimited history.
          </p>
          <div className="mt-8">
            <button
              onClick={() => router.back()}
              className="group text-sm text-muted-foreground hover:text-foreground transition-all flex items-center gap-2 mx-auto px-4 py-1.5 rounded-full border border-border bg-card/50 hover:bg-card hover:border-sidebar-border"
            >
              <span className="transition-transform group-hover:-translate-x-1">
                ←
              </span>
              <span>Go Back</span>
            </button>
          </div>
        </div>

        <main>
          <PricingTable />
        </main>
      </div>
    </div>
  );
}
