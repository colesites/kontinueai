"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckIcon } from "lucide-react";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

// An elicitation component: the model presents a question with choices and the
// user selects one (single) or several (multiple) before continuing. This is the
// counterpart to Confirmation — not accept/reject, but "pick from these".

export type OptionItem = {
  value: string;
  label: string;
  description?: string;
};

type OptionsContextValue = {
  multiple: boolean;
  selected: string[];
  toggle: (value: string) => void;
  submitted: boolean;
};

const OptionsContext = createContext<OptionsContextValue | null>(null);

const useOptions = () => {
  const ctx = useContext(OptionsContext);
  if (!ctx) {
    throw new Error("Options.* must be used within <Options>");
  }
  return ctx;
};

export type OptionsProps = Omit<ComponentProps<"div">, "onSubmit"> & {
  /** false = single select (auto-submits on pick), true = multi select. */
  multiple?: boolean;
  /** Pre-selected values. */
  defaultValue?: string[];
  /** Called with the chosen value(s). Single select passes one value. */
  onSubmit?: (values: string[]) => void;
  /** Lock the control after a choice is made. */
  submitted?: boolean;
  /** Show an "Other" free-text input for a custom answer (default true). */
  allowCustom?: boolean;
  children?: ReactNode;
};

export const Options = ({
  multiple = false,
  defaultValue = [],
  onSubmit,
  submitted = false,
  allowCustom = true,
  className,
  children,
  ...props
}: OptionsProps) => {
  const [selected, setSelected] = useState<string[]>(defaultValue);
  const [custom, setCustom] = useState("");

  const toggle = (value: string) => {
    if (submitted) return;
    if (multiple) {
      setSelected((current) =>
        current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      );
    } else {
      setSelected([value]);
      onSubmit?.([value]); // single select submits immediately
    }
  };

  const submitMulti = () => {
    const extra = custom.trim();
    const values = extra ? [...selected, extra] : selected;
    if (values.length > 0) onSubmit?.(values);
  };

  const ctx = useMemo(
    () => ({ multiple, selected, toggle, submitted }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [multiple, selected, submitted],
  );

  return (
    <OptionsContext.Provider value={ctx}>
      <div
        className={cn(
          "not-prose flex w-full flex-col gap-2 rounded-md border p-3",
          className,
        )}
        {...props}
      >
        {children}

        {allowCustom && !submitted ? (
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && custom.trim()) {
                e.preventDefault();
                if (multiple) submitMulti();
                else onSubmit?.([custom.trim()]);
              }
            }}
            placeholder="Other — type your own…"
            className="mt-0.5 h-8 w-full rounded-md border border-border bg-transparent px-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        ) : null}

        {multiple && !submitted ? (
          <Button
            className="mt-1 h-8 self-end px-3 text-sm"
            type="button"
            disabled={selected.length === 0 && custom.trim().length === 0}
            onClick={submitMulti}
          >
            Submit
          </Button>
        ) : null}
      </div>
    </OptionsContext.Provider>
  );
};

export const OptionsPrompt = ({
  className,
  ...props
}: ComponentProps<"p">) => (
  <p className={cn("text-sm font-medium text-foreground", className)} {...props} />
);

export const OptionsList = ({ className, ...props }: ComponentProps<"div">) => (
  <div
    className={cn(
      "kode-scroll flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1",
      className,
    )}
    {...props}
  />
);

export type OptionProps = {
  value: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export const Option = ({
  value,
  description,
  children,
  className,
}: OptionProps) => {
  const { selected, toggle, multiple, submitted } = useOptions();
  const isSelected = selected.includes(value);

  return (
    <button
      type="button"
      disabled={submitted && !isSelected}
      onClick={() => toggle(value)}
      aria-pressed={isSelected}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "border-primary bg-primary/10"
          : "border-border bg-transparent",
        submitted && !isSelected ? "opacity-50" : "",
        className,
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center border",
          multiple ? "rounded" : "rounded-full",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40",
        )}
      >
        {isSelected ? <CheckIcon className="size-3" /> : null}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{children}</span>
        {description ? (
          <span className="text-xs text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </button>
  );
};
