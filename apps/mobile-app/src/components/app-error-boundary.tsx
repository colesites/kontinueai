import React from "react";
import { Pressable, ScrollView, Text as RNText, View } from "react-native";
import * as Sentry from "@sentry/react-native";

import { DEFAULT_THEME, THEME_TOKENS } from "@/theme/tokens.generated";

// Renders above ThemeProvider (it catches crashes in it too), so it reads the
// generated default dark tokens directly instead of useTheme(), the same way
// web's global-error page is self-contained.
const t = THEME_TOKENS[DEFAULT_THEME].dark;

type AppErrorBoundaryState = {
  error: Error | null;
};

export class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[app-crash-boundary]", error, info.componentStack);
    Sentry.withScope((scope) => {
      scope.setContext("react", { componentStack: info.componentStack });
      Sentry.captureException(error);
    });
  }

  render() {
    const { error } = this.state;

    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: t.background, padding: 24 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        >
          <RNText
            style={{
              color: t.primary,
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 2.5,
              textTransform: "uppercase",
            }}
          >
            Kontinue AI
          </RNText>
          <RNText
            style={{
              color: t.foreground,
              fontSize: 26,
              fontWeight: "600",
              letterSpacing: -0.4,
              marginTop: 10,
            }}
          >
            Something went wrong
          </RNText>
          <RNText
            style={{
              color: t["muted-foreground"],
              fontSize: 15,
              lineHeight: 22,
              marginTop: 8,
            }}
          >
            The app hit an unexpected error. It has been reported. Try again,
            and if it keeps happening, restart the app.
          </RNText>
          {__DEV__ && error.stack ? (
            <RNText
              selectable
              style={{
                color: t["muted-foreground"],
                fontSize: 11,
                lineHeight: 16,
                marginTop: 18,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: t.border,
                backgroundColor: t.card,
              }}
            >
              {error.message}
              {"\n\n"}
              {error.stack}
            </RNText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => this.setState({ error: null })}
            style={{
              alignItems: "center",
              backgroundColor: t.primary,
              borderRadius: 14,
              height: 48,
              justifyContent: "center",
              marginTop: 28,
            }}
          >
            <RNText
              style={{
                color: t["primary-foreground"],
                fontSize: 15,
                fontWeight: "700",
              }}
            >
              Try again
            </RNText>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}
