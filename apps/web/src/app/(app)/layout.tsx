import { Suspense } from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect, unauthorized } from "next/navigation";
import { cookies, headers } from "next/headers";
import { AppShell } from "./AppShell";
import LoadingFallback from "../../components/LoadingFallback";
import type { Metadata } from "next";
import { convexServer } from "@repo/core/convex-server";
import { api } from "@repo/convex/convex/_generated/api";

export const metadata: Metadata = {
  title: "Kontinue AI - Chat",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check auth at page level - more secure than proxy
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  // Whitelist check (Production only)
  const headerList = await headers();
  const host = headerList.get("host") || "";
  const isProductionDomain =
    host === "chat.kontinueai.com" || host.endsWith(".vercel.app"); // Also catch preview deploys if needed

  // Whitelist temporarily deactivated as waitlist countdown is ending
  /*
  if (isProductionDomain) {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress;

    if (email) {
      const whitelisted = await convexServer.query(
        api.whitelist.isWhitelisted,
        { email },
      );
      if (!whitelisted) {
        unauthorized();
      }
    }
  }
  */

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true";

  return (
    <Suspense fallback={<LoadingFallback />}>
      <AppShell defaultOpen={defaultOpen}>{children}</AppShell>
    </Suspense>
  );
}
