"use client";

import {
	KODE_REMOTE_DEFAULT_MODE,
	KODE_REMOTE_MODES,
	type KodeRemoteMode,
} from "@repo/core/kode-remote";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@repo/ui/components/ui/select";
import { cn } from "@repo/ui/lib/utils";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { type ReactNode, useState } from "react";

export type RemoteModel = { id: string; name: string };

/** Prompt box for a remote thread: text, model and permission mode. */
export function RemoteComposer({
	models,
	defaultModelId,
	onSend,
	disabled,
	placeholder,
	note,
	leading,
}: {
	models: RemoteModel[];
	defaultModelId: string | null;
	onSend: (input: {
		text: string;
		modelId?: string;
		mode: KodeRemoteMode;
	}) => Promise<boolean>;
	disabled?: boolean;
	placeholder: string;
	note?: ReactNode;
	/** Extra picker before the model (the project, for a new thread). */
	leading?: ReactNode;
}) {
	const [text, setText] = useState("");
	const [modelId, setModelId] = useState<string>(
		defaultModelId && models.some((m) => m.id === defaultModelId)
			? defaultModelId
			: "",
	);
	const [mode, setMode] = useState<KodeRemoteMode>(KODE_REMOTE_DEFAULT_MODE);
	const [sending, setSending] = useState(false);

	const submit = async () => {
		const value = text.trim();
		if (!value || sending || disabled) return;
		setSending(true);
		const ok = await onSend({
			text: value,
			modelId: modelId || undefined,
			mode,
		});
		setSending(false);
		if (ok) setText("");
	};

	const trigger =
		"h-8 w-auto max-w-[180px] gap-1.5 rounded-full border-0 bg-foreground/5 px-3 text-xs shadow-none";

	return (
		<div className="glow-rail glass relative rounded-[26px] bg-background/45 p-2.5 backdrop-blur-3xl">
			<textarea
				value={text}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (
						event.key === "Enter" &&
						!event.shiftKey &&
						!event.nativeEvent.isComposing
					) {
						event.preventDefault();
						void submit();
					}
				}}
				rows={2}
				placeholder={placeholder}
				disabled={disabled}
				className="max-h-56 min-h-14 w-full resize-none bg-transparent px-3 pt-2 text-sm outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
			/>
			<div className="flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
				{leading}
				{models.length > 0 ? (
					<Select
						value={modelId || "__default"}
						onValueChange={(value) =>
							setModelId(value === "__default" ? "" : value)
						}
					>
						<SelectTrigger className={trigger} aria-label="Model">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="__default">
								Computer's default model
							</SelectItem>
							{models.map((model) => (
								<SelectItem key={model.id} value={model.id}>
									{model.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : null}
				<Select
					value={mode}
					onValueChange={(value) => setMode(value as KodeRemoteMode)}
				>
					<SelectTrigger className={trigger} aria-label="Permission mode">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{KODE_REMOTE_MODES.map((option) => (
							<SelectItem key={option.id} value={option.id}>
								<span className="flex flex-col">
									<span>{option.label}</span>
									<span className="text-[11px] text-muted-foreground">
										{option.description}
									</span>
								</span>
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<button
					type="button"
					onClick={() => void submit()}
					disabled={!text.trim() || sending || disabled}
					aria-label="Send"
					className={cn(
						"glow-button ml-auto flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity",
						(!text.trim() || sending || disabled) && "opacity-40",
					)}
				>
					{sending ? (
						<LoaderCircle className="size-4 animate-spin" />
					) : (
						<ArrowUp className="size-4" />
					)}
				</button>
			</div>
			{note ? (
				<div className="px-3 pb-1 pt-1.5 text-[11px] text-muted-foreground">
					{note}
				</div>
			) : null}
		</div>
	);
}
