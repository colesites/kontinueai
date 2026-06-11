module.exports = {
  rootDir: ".",
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  transform: {
    "^.+\\.[tj]sx?$": "babel-jest",
  },
  moduleNameMapper: {
    "\\.(png|jpg|jpeg|gif|webp)$": "<rootDir>/test/imageMock.js",
    "^@/assets/(.*)$": "<rootDir>/assets/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@repo/ai/lib/(.*)$": "<rootDir>/../../packages/ai/src/lib/$1",
    "^@repo/core/(.*)$": "<rootDir>/../../packages/core/src/$1",
    "^@repo/convex/(.*)$": "<rootDir>/../../packages/backend/convex/$1",
    "^react$": "<rootDir>/../../node_modules/react",
    "^react/jsx-runtime$": "<rootDir>/../../node_modules/react/jsx-runtime.js",
    "^react-native$": "react-native-web",
    "^react-native-css$": "<rootDir>/test/reactNativeCssMock.js",
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
};
