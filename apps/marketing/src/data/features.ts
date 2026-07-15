export interface HowItWorksStep {
	index: string;
	title: string;
	description: string;
	image: string;
}

export const howItWorksSteps: HowItWorksStep[] = [
	{
		index: "01",
		title: "Import a supported conversation",
		description:
			"Paste a supported shared-conversation link or upload an available export. Supported messages are prepared in sequence for the next model.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229188/import_d8xvho.jpg",
	},
	{
		index: "02",
		title: "Switch models in one click",
		description:
			"Continue the same thread with K-AI 1.0 or another supported model. The available conversation history stays in the thread.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229140/anymodel_vdvx4h.jpg",
	},
	{
		index: "03",
		title: "One plan, every model",
		description:
			"Use selected models and Kontinue tools from one account. Model availability and usage limits depend on your plan.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229062/lessmoney_umvfhq.jpg",
	},
];

export interface FeatureBlock {
	eyebrow: string;
	title: string;
	description: string;
	image?: string;
	images?: string[];
	videos?: string[];
}

export const featureBlocks: FeatureBlock[] = [
	{
		eyebrow: "Voice",
		title: "Use voice across supported languages",
		description:
			"Record a voice note and turn it into text for quick prompts, notes, and ideas. Language support and transcription quality can vary.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781228978/audio_li1rdo.jpg",
	},
	{
		eyebrow: "Images",
		title: "Generate images in the chat",
		description:
			"Create and iterate on images from a prompt without leaving the Kontinue workspace. Model availability can vary by plan.",
		images: [
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229272/woman-in-urban_hxvo2q.jpg",
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229285/cute-face_lnxue9.webp",
		],
	},
	{
		eyebrow: "Video",
		title: "Turn a prompt into video",
		description:
			"Generate short video clips from a description inside Canvas. Available models, duration, and resolution can vary by plan.",
		videos: [
			"https://res.cloudinary.com/dqovfvo29/video/upload/q_auto/f_auto/v1781229447/pricess-knight_q3duzd.mp4",
			"https://res.cloudinary.com/dqovfvo29/video/upload/q_auto/f_auto/v1781229380/model_op05uz.mp4",
		],
	},
];
