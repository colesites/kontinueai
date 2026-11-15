import { useAuth } from "@clerk/clerk-react";
import { useEffect, useState } from "react";

/** Preserve identity only during an auth reload, never after confirmed sign-out. */
export function useStableUserId(): string | null {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    if (isLoaded) setLast(isSignedIn ? (userId ?? null) : null);
  }, [isLoaded, isSignedIn, userId]);
  return isLoaded ? (isSignedIn ? (userId ?? null) : null) : last;
}
