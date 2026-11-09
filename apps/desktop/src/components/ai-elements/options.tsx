"use client";

import { cn } from "@/lib/utils";
import {
  createContext,
  useContext,
  useCallback,
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

  const toggle = useCallback(
    (value: string) => {
      if (submitted) return;
      if (multiple) {
        setSelected((current) =>
          current.includes(value)
            ? current.filter((v) => v !== value)
            : [...current, value],
        );
      } else {
        setSelected([value]);
        onSubmit?.([value]);
      }
    },
    [multiple, onSubmit, submitted],
  );

  const submitMulti = () => {
    const extra = custom.trim();
    const values = extra ? [...selected, extra] : selected;
    if (values.length > 0) onSubmit?.(values);
  };

  const ctx = useMemo(
    () => ({ multiple, selected, toggle, submitted }),
    [multiple, selected, submitted, toggle],
  );

  return (
    <OptionsContext.Provider value={ctx}>
      <div
        className={cn("not-prose flex w-full flex-col gap-1.5", className)}
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
            className="h-6 w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        ) : null}

        {multiple && !submitted ? (
          <button
            type="button"
            disabled={selected.length === 0 && custom.trim().length === 0}
            onClick={submitMulti}
            className="flex h-6 cursor-pointer items-center self-start rounded-md px-1.5 text-[11px] font-medium text-foreground hover:bg-black/[0.05] disabled:opacity-40 dark:hover:bg-white/[0.08]"
          >
            Continue
          </button>
        ) : null}
      </div>
    </OptionsContext.Provider>
  );
};

export const OptionsPrompt = ({
  className,
  ...props
}: ComponentProps<"p">) => (
  <p className={cn("text-[11px] text-foreground/80", className)} {...props} />
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
  const { selected, toggle, submitted } = useOptions();
  const isSelected = selected.includes(value);

  return (
    <button
      type="button"
      disabled={submitted && !isSelected}
      onClick={() => toggle(value)}
      aria-pressed={isSelected}
      title={description}
      className={cn(
        "flex h-6 w-fit cursor-pointer items-center rounded-md px-1.5 text-[11px] text-foreground/70 transition-colors hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.06]",
        isSelected && "bg-black/[0.06] text-foreground dark:bg-white/[0.08]",
        submitted && !isSelected && "opacity-40",
        className,
      )}
    >
      {children}
    </button>
  );
};
