import React from "react";
import { Pressable, ScrollView, Text as RNText, View } from "react-native";
import * as Sentry from "@sentry/react-native";

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
      <View style={{ flex: 1, backgroundColor: "#080609", padding: 24 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
        >
          <RNText
            style={{
              color: "#ffffff",
              fontSize: 24,
              fontWeight: "700",
              marginBottom: 10,
            }}
          >
            Something crashed
          </RNText>
          <RNText style={{ color: "#d4d4d4", fontSize: 15, lineHeight: 22 }}>
            {error.message}
          </RNText>
          {error.stack ? (
            <RNText
              selectable
              style={{
                color: "#9ca3af",
                fontSize: 12,
                lineHeight: 17,
                marginTop: 18,
              }}
            >
              {error.stack}
            </RNText>
          ) : null}
          <Pressable
            onPress={() => this.setState({ error: null })}
            style={{
              alignItems: "center",
              backgroundColor: "#f5f5f5",
              borderRadius: 12,
              height: 48,
              justifyContent: "center",
              marginTop: 24,
            }}
          >
            <RNText
              style={{ color: "#171717", fontSize: 15, fontWeight: "700" }}
            >
              Try again
            </RNText>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}
