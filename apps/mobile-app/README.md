# Kontinue AI mobile

The Expo/React Native client for Kontinue AI. It shares Clerk, Convex, core
product constants, AI routes, connectors, Canvas, Kode and billing rules with
the web app.

Before changing or building this app, read:

- `AGENTS.md` for the exact Expo SDK requirement;
- `WEB_PARITY.md` for the web-to-native product contract;
- `BUILD_VERSIONING.md` for mandatory release versioning.

## Get started

1. Install dependencies

   ```bash
   bun install
   ```

2. Start the app

   ```bash
   bun run dev
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Android Google sign-in

Standalone Android builds use Clerk's native Google Credential Manager flow.
The Google Cloud and Clerk dashboard registrations must match the EAS release
keystore—not a local debug keystore.

- Android package: `com.kontinueai.app`
- Current EAS SHA-1: `56:B9:A5:62:56:8C:68:00:76:43:6B:CF:56:86:E7:C0:F7:D9:FE:57`
- Current EAS SHA-256: `74:2C:72:79:6C:2C:20:D0:23:5B:E7:7C:3B:C1:9F:8D:9F:EB:4A:58:EB:45:3C:55:03:56:B3:C6:44:4B:CD:77`

Google Cloud's Android OAuth client needs the package and SHA-1. Clerk's Native
Applications entry needs the package and SHA-256. Google must also be enabled
for both sign-in and sign-up in Clerk with custom web-client credentials. If the
EAS keystore changes, update both registrations before publishing another APK.

## Email verification delivery

Mobile email/password sign-up uses Clerk's built-in email delivery through
`signUp.verifications.sendEmailCode()`; it does not call Resend directly. The
verification screen supports retry with a 30-second cooldown and surfaces the
provider error when Clerk rejects a send. For production delivery incidents,
check Clerk Dashboard → Logs → Email logs and confirm the recipient shown in
the app before investigating the mail provider.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
