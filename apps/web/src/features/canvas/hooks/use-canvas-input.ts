"use client";

import {
	ASPECT_RATIOS,
	DEFAULT_IMAGE_MODEL,
	DEFAULT_VIDEO_MODEL,
	getCanvasModelById,
	isDurationSupported,
	isRatioSupported,
	maxReferenceImagesFor,
	VIDEO_DURATIONS,
} from "@repo/ai/lib/canvas-models";
import { appError } from "@repo/core/app-errors";
import { nextPlanWithMore, PLAN_DEFINITIONS } from "@repo/core/plan-config";
import { readApiError, showAppErrorToast } from "@web/lib/app-error-toast";
import { usePlanTier } from "@web/lib/use-plan-tier";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export interface AttachedImage {
	id: string;
	url: string;
	previewUrl: string;
	filename: string;
}

interface UseCanvasInputProps {
	onGenerate: (opts: {
		prompt: string;
		mode: "image" | "video";
		model: string;
		aspectRatio: string;
		resolution?: string;
		duration?: number;
		quality?: "standard" | "pro";
		imageUrls?: string[];
	}) => void;
	isGenerating: boolean;
	credits: { remaining: number; total: number };
	canGenerateImages: boolean;
	canGenerateVideos: boolean;
}

export function useCanvasInput({
	onGenerate,
	isGenerating,
	credits,
	canGenerateImages,
	canGenerateVideos,
}: UseCanvasInputProps) {
	const [mode, setMode] = useState<"image" | "video">("image");
	const [prompt, setPrompt] = useState("");
	const [aspectRatio, setAspectRatio] = useState("3:2");
	const [resolution, setResolution] = useState("");
	const [imageModel, setImageModel] = useState(DEFAULT_IMAGE_MODEL);
	const [videoModel, setVideoModel] = useState(DEFAULT_VIDEO_MODEL);
	const [duration, setDuration] = useState(5);
	const [quality, setQuality] = useState<"standard" | "pro">("standard");
	const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const planTier = usePlanTier();
	const plan = PLAN_DEFINITIONS[planTier];
	const fileInputRef = useRef<HTMLInputElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const activeModel = mode === "image" ? imageModel : videoModel;
	const selectedModelData = getCanvasModelById(activeModel);
	const currentProvider = selectedModelData?.provider || "";
	const isFreeModel = selectedModelData?.isFree || false;

	// Reference images: the plan's allowance, capped by what the model accepts.
	const maxImages = maxReferenceImagesFor(
		selectedModelData,
		plan.canvasReferenceImages,
	);

	// Switching to a model that takes fewer images drops the extras.
	useEffect(() => {
		if (attachedImages.length <= maxImages) return;
		for (const img of attachedImages.slice(maxImages)) {
			URL.revokeObjectURL(img.previewUrl);
		}
		setAttachedImages(attachedImages.slice(0, maxImages));
		toast.info(
			maxImages === 0
				? "This model doesn't use reference images, so they were removed."
				: `This model takes up to ${maxImages} reference image${maxImages === 1 ? "" : "s"}. Extra images were removed.`,
		);
	}, [attachedImages, maxImages]);

	const isWan = activeModel.includes("wan");
	const isKling = activeModel.includes("kling");
	const maxChars = isWan ? 500 : isKling ? 2500 : undefined;

	// Auto-reset aspect ratio if not supported by current provider
	const [prevProvider, setPrevProvider] = useState(currentProvider);
	if (currentProvider !== prevProvider) {
		setPrevProvider(currentProvider);
		if (!isRatioSupported(currentProvider, aspectRatio)) {
			const firstSupported = ASPECT_RATIOS.find((r) =>
				isRatioSupported(currentProvider, r.value),
			);
			if (firstSupported) {
				setAspectRatio(firstSupported.value);
			}
		}
	}

	// Auto-reset resolution if model changes
	const [prevModel, setPrevModel] = useState(activeModel);
	if (activeModel !== prevModel) {
		setPrevModel(activeModel);
		const firstResolution = selectedModelData?.resolutions?.[0];
		if (firstResolution) {
			setResolution(firstResolution.value);
		} else {
			setResolution("");
		}

		// Auto-reset duration if not supported by model
		if (mode === "video" && !isDurationSupported(activeModel, duration)) {
			const supported = VIDEO_DURATIONS.find((d) =>
				isDurationSupported(activeModel, d),
			);
			if (supported) {
				setDuration(supported);
			}
		}
	}

	const calculateCostMultiplier = () => {
		if (isFreeModel) return 0;
		if (isKling) return quality === "pro" ? 20 : 15;

		if (resolution.includes("1080")) return 20;
		if (resolution.includes("720")) return 15;
		if (resolution.includes("480")) return 10;

		return 15; // Default fallback
	};

	const costMultiplier = calculateCostMultiplier();

	// Auto-correct duration if current choice becomes unaffordable (and not a free model)
	const [prevCreditsRemaining, setPrevCreditsRemaining] = useState(
		credits.remaining,
	);
	if (credits.remaining !== prevCreditsRemaining) {
		setPrevCreditsRemaining(credits.remaining);
		if (
			!isFreeModel &&
			mode === "video" &&
			duration * costMultiplier > credits.remaining
		) {
			const affordable = [...VIDEO_DURATIONS]
				.reverse()
				.find((d) => d * costMultiplier <= credits.remaining);
			if (affordable && affordable !== duration) {
				setDuration(affordable);
			}
		}
	}

	const canSubmit =
		!!prompt.trim() &&
		!isGenerating &&
		(isFreeModel ||
			(mode === "image" ? canGenerateImages : canGenerateVideos)) &&
		(!maxChars || prompt.trim().length <= maxChars);

	const uploadOne = useCallback(
		async (file: File): Promise<AttachedImage | null> => {
			const previewUrl = URL.createObjectURL(file);
			try {
				const res = await fetch(
					`/api/files/upload?filename=${encodeURIComponent(file.name)}`,
					{ method: "POST", body: file },
				);
				if (!res.ok) {
					showAppErrorToast(await readApiError(res));
					URL.revokeObjectURL(previewUrl);
					return null;
				}
				const data = (await res.json()) as { url: string };
				return {
					id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
					url: data.url,
					previewUrl,
					filename: file.name,
				};
			} catch (err) {
				URL.revokeObjectURL(previewUrl);
				showAppErrorToast(err);
				return null;
			}
		},
		[],
	);

	const handleFileAttach = useCallback(
		async (e: React.ChangeEvent<HTMLInputElement>) => {
			const files = Array.from(e.target.files ?? []);
			// Reset input so the same file can be re-selected
			if (fileInputRef.current) fileInputRef.current.value = "";
			if (files.length === 0) return;

			if (maxImages === 0) {
				showAppErrorToast(
					plan.canvasReferenceImages === 0
						? appError("PLAN_REQUIRED", {
								title: "Reference images need Pro",
								message:
									"Using your own images in Canvas comes with Pro and Max.",
								upgradeTo: "pro",
							})
						: appError("INVALID_REQUEST", {
								title: "Not supported by this model",
								message:
									"This model doesn't take reference images. Pick another model to use one.",
							}),
				);
				return;
			}

			const slots = maxImages - attachedImages.length;
			if (slots <= 0 || files.length > slots) {
				// Upgrading only helps when the plan, not the model, is the cap.
				const planIsCap = maxImages >= plan.canvasReferenceImages;
				const upgradeTo = planIsCap
					? nextPlanWithMore(planTier, (p) => p.canvasReferenceImages)
					: undefined;
				showAppErrorToast(
					appError("USAGE_LIMIT_REACHED", {
						title: "Image limit reached",
						message: `You can use up to ${maxImages} reference image${maxImages === 1 ? "" : "s"} with this model on ${plan.name}.${
							slots > 0 ? ` Adding the first ${slots}.` : ""
						}${upgradeTo ? ` ${PLAN_DEFINITIONS[upgradeTo].name} allows ${PLAN_DEFINITIONS[upgradeTo].canvasReferenceImages}.` : ""}`,
						upgradeTo,
					}),
				);
				if (slots <= 0) return;
			}

			const accepted: File[] = [];
			for (const file of files.slice(0, slots)) {
				if (!file.type.startsWith("image/")) {
					showAppErrorToast(
						appError("INVALID_REQUEST", {
							title: "Images only",
							message: `${file.name} isn't an image. Attach PNG, JPG, WebP or GIF files.`,
						}),
					);
					continue;
				}
				if (file.size > plan.maxChatUploadBytes) {
					const upgradeTo = nextPlanWithMore(
						planTier,
						(p) => p.maxChatUploadBytes,
					);
					const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));
					showAppErrorToast(
						appError("PLAN_REQUIRED", {
							title: "Image too large",
							message: `${file.name} is ${mb(file.size)}MB. ${plan.name} allows up to ${mb(plan.maxChatUploadBytes)}MB per file.`,
							upgradeTo,
						}),
					);
					continue;
				}
				accepted.push(file);
			}
			if (accepted.length === 0) return;

			setIsUploading(true);
			try {
				const uploaded = (await Promise.all(accepted.map(uploadOne))).filter(
					(img): img is AttachedImage => img !== null,
				);
				if (uploaded.length > 0) {
					setAttachedImages((current) =>
						[...current, ...uploaded].slice(0, maxImages),
					);
				}
			} finally {
				setIsUploading(false);
			}
		},
		[attachedImages.length, maxImages, plan, planTier, uploadOne],
	);

	const removeAttachedImage = useCallback((id: string) => {
		setAttachedImages((current) => {
			const target = current.find((img) => img.id === id);
			if (target) URL.revokeObjectURL(target.previewUrl);
			return current.filter((img) => img.id !== id);
		});
	}, []);

	const clearAttachedImages = useCallback(() => {
		setAttachedImages((current) => {
			for (const img of current) URL.revokeObjectURL(img.previewUrl);
			return [];
		});
	}, []);

	const handleSubmit = useCallback(() => {
		if (!canSubmit) return;
		onGenerate({
			prompt: prompt.trim(),
			mode,
			model: activeModel,
			aspectRatio,
			resolution: resolution || undefined,
			quality,
			...(mode === "video" && { duration }),
			...(attachedImages.length > 0 && {
				imageUrls: attachedImages.map((img) => img.url),
			}),
		});
		setPrompt("");
		clearAttachedImages();
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [
		canSubmit,
		onGenerate,
		prompt,
		mode,
		activeModel,
		aspectRatio,
		quality,
		duration,
		resolution,
		attachedImages,
		clearAttachedImages,
	]);

	const handlePromptChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setPrompt(e.target.value);
			e.target.style.height = "auto";
			e.target.style.height = `${e.target.scrollHeight}px`;
		},
		[],
	);

	return {
		mode,
		setMode,
		prompt,
		setPrompt,
		handlePromptChange,
		aspectRatio,
		setAspectRatio,
		resolution,
		setResolution,
		imageModel,
		setImageModel,
		videoModel,
		setVideoModel,
		duration,
		setDuration,
		quality,
		setQuality,
		maxChars,
		fileInputRef,
		textareaRef,
		currentProvider,
		activeModel,
		selectedModelData,
		isFreeModel,
		costMultiplier,
		canSubmit,
		handleSubmit,
		attachedImages,
		maxImages,
		isUploading,
		handleFileAttach,
		removeAttachedImage,
	};
}
