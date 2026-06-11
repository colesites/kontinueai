import { jest } from "@jest/globals";

jest.mock("expo-image", () => {
  const React = require("react");
  return {
    Image: ({
      source: _source,
      contentFit: _contentFit,
      tintColor: _tintColor,
      ...props
    }: Record<string, unknown>) => React.createElement("img", props),
  };
});

jest.mock("lucide-react-native", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const Icon = (props: Record<string, unknown>) =>
    React.createElement(Text, props, "icon");

  return new Proxy(
    { __esModule: true },
    {
      get: (_target, prop) => {
        if (prop === "__esModule") return true;
        return Icon;
      },
    },
  );
});
