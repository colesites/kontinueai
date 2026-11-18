import type { Href, useRouter } from "expo-router";

type Router = ReturnType<typeof useRouter>;

/**
 * Back, or to `fallback` when there is nothing to go back to. A bare
 * router.back() is a no-op when the screen is the first in the stack: opened
 * from a deep link (the connectors OAuth return, a push notification) or after
 * a replace, which is how "Back to chat" on Connectors stopped working.
 */
export function goBackOr(router: Router, fallback: Href = "/") {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
