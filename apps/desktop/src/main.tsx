import React from "react";
import ReactDOM from "react-dom/client";
import "./styles/globals.css";
import { installScrollbarActivity } from "./lib/scrollbar-activity";
import { installAppSettings } from "./lib/app-settings";

installScrollbarActivity();
installAppSettings();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

function dismissSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  splash.classList.add("hide");
  setTimeout(() => splash.remove(), 400);
}

function StartupError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6 text-foreground">
      <section className="max-w-xl rounded-xl border border-red-500/30 bg-red-500/5 p-5">
        <h1 className="text-lg font-semibold">Kontinue AI could not start</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Restart the app. If this continues, copy the message below and share it
          with the development team.
        </p>
        <pre className="mt-4 overflow-auto whitespace-pre-wrap text-xs text-red-300">
          {message}
        </pre>
      </section>
    </main>
  );
}

class StartupErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error("[startup] React failed to render Kontinue AI", error);
    dismissSplash();
  }

  render() {
    return this.state.error ? (
      <StartupError error={this.state.error} />
    ) : (
      this.props.children
    );
  }
}

// This is deliberately registered before importing App: a failed App dependency
// used to prevent this callback from ever being installed, trapping the window on
// the static HTML splash screen.
setTimeout(() => {
  dismissSplash();
}, 7000);

void import("./App")
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <StartupErrorBoundary>
          <App />
        </StartupErrorBoundary>
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("[startup] Failed to load Kontinue AI", error);
    dismissSplash();
    root.render(<StartupError error={error} />);
  });
