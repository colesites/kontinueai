module.exports = function (api) {
  api.cache(true);
  return {
    // NativeWind v5 (react-native-css) does NOT use jsxImportSource — its babel
    // preset + the metro transform handle className. Setting jsxImportSource
    // here makes every file import the nonexistent "nativewind/jsx-runtime".
    presets: ["babel-preset-expo", "nativewind/babel"],
  };
};
