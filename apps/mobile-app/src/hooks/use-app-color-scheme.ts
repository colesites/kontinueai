import { useColorScheme as useNativewindColorScheme } from "nativewind";

export type ColorSchemeName = "light" | "dark";

/**
 * App color-scheme controller backed by NativeWind. Returns the resolved scheme
 * plus setters that flip the `.dark` class app-wide. Dark is the app default.
 */
export function useAppColorScheme() {
  const { colorScheme, setColorScheme, toggleColorScheme } =
    useNativewindColorScheme();
  const scheme: ColorSchemeName = colorScheme === "light" ? "light" : "dark";
  return {
    colorScheme: scheme,
    isDark: scheme === "dark",
    setColorScheme,
    toggleColorScheme,
  };
}
