"use client";

import { Button } from "@repo/ui/components/ui/button";
import { Textarea } from "@repo/ui/components/ui/textarea";
import { cn } from "@repo/ui/lib/utils";
import { Loader2, SendHorizontal } from "lucide-react";
import * as React from "react";
import { IoStop } from "react-icons/io5";
import { SubmitGlowButton } from "./submit-glow-button";

// -- Context for the prompt input state --
interface PromptInputContextValue {
	value: string;
	setValue: (value: string) => void;
	isLoading: boolean;
	disabled: boolean;
	onSubmit: () => void;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
}

const PromptInputContext = React.createContext<
	PromptInputContextValue | undefined
>(undefined);

const noop = () => undefined;

export function usePromptInput() {
	const context = React.useContext(PromptInputContext);
	if (!context) {
		throw new Error("usePromptInput must be used within a PromptInputProvider");
	}
	return context;
}

// -- Components --

export function PromptInputProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	// In a real app, you might lift state up or use a store.
	// For this UI component, we'll let the PromptInput control the context if needed,
	// but the user's example wraps everything in Provider.
	// We'll use a dummy context here since the actual state is often controlled by PromptInput props.
	return (
		<PromptInputContext.Provider
			value={{
				value: "",
				setValue: noop,
				isLoading: false,
				disabled: false,
				onSubmit: noop,
				fileInputRef: React.createRef<HTMLInputElement>(),
			}}
		>
			{children}
		</PromptInputContext.Provider>
	);
}

export interface PromptInputProps {
	children: React.ReactNode;
	onSubmit: () => void;
	value?: string;
	onValueChange?: (value: string) => void;
	isLoading?: boolean;
	disabled?: boolean;
	className?: string;
}

export function PromptInput({
	children,
	onSubmit,
	value,
	onValueChange,
	isLoading = false,
	disabled = false,
	className,
}: PromptInputProps) {
	// We allow controlled or uncontrolled, but for this implementation we prefer controlled from parent
	const [internalValue, setInternalValue] = React.useState("");
	const isControlled = value !== undefined;
	const actualValue = isControlled ? value : internalValue;
	const actualOnChange = isControlled ? onValueChange : setInternalValue;

	const handleSubmit = () => {
		if (!actualValue.trim() || isLoading || disabled) return;
		onSubmit();
		if (!isControlled) setInternalValue("");
	};

	// Provide context for children
	const contextValue: PromptInputContextValue = {
		value: actualValue,
		setValue: (val) => actualOnChange?.(val),
		isLoading,
		disabled,
		onSubmit: handleSubmit,
		fileInputRef: React.createRef(),
	};

	return (
		<PromptInputContext.Provider value={contextValue}>
			<div className={cn("relative flex flex-col overflow-hidden", className)}>
				{children}
			</div>
		</PromptInputContext.Provider>
	);
}

export function PromptInputBody({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative min-h-[52px] w-full px-2 pt-1 pb-1">
			{children}
		</div>
	);
}

export const PromptInputTextarea = React.forwardRef<
	HTMLTextAreaElement,
	React.ComponentPropsWithoutRef<typeof Textarea>
>(({ className, ...props }, ref) => {
	const { value, setValue, onSubmit, isLoading, disabled } = usePromptInput();
	const internalRef = React.useRef<HTMLTextAreaElement>(null);

	const setTextareaRef = React.useCallback(
		(node: HTMLTextAreaElement | null) => {
			internalRef.current = node;
			if (typeof ref === "function") {
				ref(node);
			} else if (ref) {
				ref.current = node;
			}
		},
		[ref],
	);

	React.useEffect(() => {
		const textarea = internalRef.current;
		if (!textarea || textarea.value !== value) return;
		textarea.style.height = "auto";
		textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
	}, [value]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		}
	};

	return (
		<Textarea
			ref={setTextareaRef}
			value={value}
			onChange={(e) => setValue(e.target.value)}
			onKeyDown={handleKeyDown}
			disabled={disabled || isLoading}
			rows={1}
			className={cn(
				"min-h-[24px] max-h-[200px] w-full resize-none border-0 bg-transparent dark:bg-transparent disabled:bg-transparent dark:disabled:bg-transparent px-0 py-0 text-base shadow-none outline-none focus-visible:ring-0 placeholder:text-muted-foreground/60 dark:placeholder:text-muted-foreground",
				className,
			)}
			placeholder="Ask anything..."
			{...props}
		/>
	);
});
PromptInputTextarea.displayName = "PromptInputTextarea";

export function PromptInputFooter({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-2 px-1 pt-1">
			{children}
		</div>
	);
}

export function PromptInputTools({ children }: { children: React.ReactNode }) {
	return <div className="flex items-center gap-1">{children}</div>;
}

export function PromptInputButton({
	children,
	className,
	...props
}: React.ComponentProps<typeof Button>) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(
				"h-8 gap-1.5 rounded-full px-2.5 text-muted-foreground transition-all duration-200 hover:bg-foreground/5 hover:text-foreground",
				className,
			)}
			{...props}
		>
			{children}
		</Button>
	);
}

export function PromptInputSubmit({ onStop }: { onStop?: () => void }) {
	const { onSubmit, value, isLoading } = usePromptInput();
	const canSend = !!value.trim() && !isLoading;

	return (
		<SubmitGlowButton
			onClick={isLoading ? onStop : onSubmit}
			disabled={isLoading ? !onStop : !canSend}
			burst={canSend}
			aria-label={isLoading ? "Stop generating" : "Send message"}
			className={cn(
				"inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200",
				canSend
					? "glow-button text-primary-foreground hover:scale-105 hover:brightness-105 active:scale-95"
					: "bg-foreground/8 text-muted-foreground",
			)}
		>
			{isLoading ? (
				onStop ? (
					<IoStop className="h-4 w-4" />
				) : (
					<Loader2 className="h-4 w-4 animate-spin" />
				)
			) : (
				<SendHorizontal className="h-4 w-4" />
			)}
		</SubmitGlowButton>
	);
}
