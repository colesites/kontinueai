const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getSentryExpoConfig(__dirname);

// Expo SDK 56 discovers Bun workspaces automatically. Keeping legacy
// watchFolders/nodeModulesPaths/extraNodeModules overrides here can bypass
// Expo's resolver and pull a web workspace's React into the Android bundle.
// Honor the `exports` maps of workspace packages (e.g. @repo/ai → ./lib/*).
config.resolver.unstable_enablePackageExports = true;

// Import .svg files as React components (react-native-svg-transformer). NativeWind
// then wraps this transformer for className/CSS handling.
config.transformer.babelTransformerPath = require.resolve(
  "react-native-svg-transformer/expo",
);
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== "svg");
config.resolver.sourceExts = [...config.resolver.sourceExts, "svg"];

module.exports = withNativeWind(config, { input: "./src/global.css" });
