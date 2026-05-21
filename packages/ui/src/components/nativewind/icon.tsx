import { TextClassContext } from "@/components/nativewind/text";
import { cn } from "@/lib/utils";
import type { LucideIcon, LucideProps } from "lucide-react-native";
import * as React from "react";

type NativewindLucideProps = LucideProps & {
  className?: string;
};

type IconProps = NativewindLucideProps & {
  as: LucideIcon;
} & React.RefAttributes<LucideIcon>;

function IconImpl({ as: IconComponent, ...props }: IconProps) {
  const Component = IconComponent as React.ComponentType<NativewindLucideProps>;
  return <Component {...props} />;
}

/**
 * A wrapper component for Lucide icons with Nativewind `className` support.
 *
 * This component allows you to render any Lucide icon while applying utility classes
 * using `nativewind`. Lucide already forwards `className` to the underlying
 * `react-native-svg` Svg component, so this wrapper only needs to normalize types.
 *
 * @component
 * @example
 * ```tsx
 * import { ArrowRight } from 'lucide-react-native';
 * import { Icon } from '@/registry/components/ui/icon';
 *
 * <Icon as={ArrowRight} className="text-red-500" size={16} />
 * ```
 *
 * @param {LucideIcon} as - The Lucide icon component to render.
 * @param {string} className - Utility classes to style the icon using Nativewind.
 * @param {number} size - Icon size (defaults to 14).
 * @param {...LucideProps} ...props - Additional Lucide icon props passed to the "as" icon.
 */
function Icon({
  as: IconComponent,
  className,
  size = 14,
  ...props
}: IconProps) {
  const textClass = React.useContext(TextClassContext);
  return (
    <IconImpl
      as={IconComponent}
      className={cn("text-foreground", textClass, className)}
      size={size}
      {...props}
    />
  );
}

export { Icon };
