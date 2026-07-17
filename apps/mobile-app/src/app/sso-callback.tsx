// Expo Go uses `mobileapp://sso-callback`; standalone Android has also been
// observed delivering `mobileapp://callback`. Both routes intentionally share
// the same non-printing Clerk completion screen.
export { default } from "./callback";
