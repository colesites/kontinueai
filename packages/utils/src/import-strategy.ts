// Canonical copy lives in @repo/core so the Expo app (which can't resolve this
// package's .ts files under Metro) follows the same kill-switch.
export {
	getImportStrategy,
	type ImportStrategy,
} from "@repo/core/import-strategy";
