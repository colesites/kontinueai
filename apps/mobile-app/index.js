// Local entry wrapper. In this monorepo `expo-router` is hoisted to the root
// node_modules, and on EAS's clean install Metro can't resolve the bare
// `expo-router/entry` package path *as the app's main entry* — it silently
// falls back to `expo/AppEntry.js` (which imports a root `App` that doesn't
// exist here) and the build fails. Pointing `main` at this local file fixes
// that: the entry always resolves (it's in the project), and the import below
// resolves expo-router normally via Metro's nodeModulesPaths.
import "expo-router/entry";
