"use client";

import { usePathname } from "next/navigation";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const signUpPathname = pathname.includes("/sign-up");

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
            Kontinue AI
          </h1>

          {!signUpPathname ? (
            <p className="text-muted-foreground mt-2">
              Sign in to continue your AI conversations
            </p>
          ) : (
            <p className="text-muted-foreground mt-2">
              Create an account to get started
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
