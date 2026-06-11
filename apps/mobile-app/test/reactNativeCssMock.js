module.exports = {
  useCssElement: (Component, props) => {
    const React = require("react");
    const { className: _className, ...rest } = props;
    return React.createElement(Component, rest);
  },
  styled:
    (Component) =>
    ({ className: _className, ...props }) => {
      const React = require("react");
      return React.createElement(Component, props);
    },
};
