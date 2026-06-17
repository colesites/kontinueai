---
name: expo
description: Use for Expo / React Native mobile work — Expo Router, native modules, EAS build, platform APIs.
appliesTo: [expo, react-native]
version: "1.0"
docs: [https://docs.expo.dev/]
---

# Expo

## When to use
Building or debugging a React Native app using Expo.

## Rules
- Prefer **Expo Router** (file-based routing under `app/`) for navigation.
- Use Expo SDK modules (`expo-camera`, `expo-notifications`, etc.) before reaching
  for bare native modules; they work with managed workflow and EAS.
- Use the config plugin system + `app.json`/`app.config.ts` for native config; avoid
  manually editing `ios/`/`android/` in managed projects.
- Build and submit with **EAS** (`eas build`, `eas submit`); configure profiles in
  `eas.json`.
- Test on device with Expo Go for JS-only changes; use a development build when you
  add native modules.
- Keep secrets out of the bundle — use EAS secrets / env, not hardcoded keys.

## Anti-patterns
- Mixing React Navigation and Expo Router arbitrarily.
- Ejecting prematurely when an Expo module already covers the need.
- Assuming web APIs (localStorage, DOM) exist — use RN/Expo equivalents
  (`AsyncStorage`, `SecureStore`).

## Checklist
- [ ] Routing via Expo Router
- [ ] Native config through plugins/app config, not manual native edits
- [ ] Builds via EAS profiles
- [ ] No web-only APIs assumed
