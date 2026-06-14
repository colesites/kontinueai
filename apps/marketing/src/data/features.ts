export interface HowItWorksStep {
	index: string;
	title: string;
	description: string;
	image: string;
}

export const howItWorksSteps: HowItWorksStep[] = [
	{
		index: "01",
		title: "Import any chat",
		description:
			"Paste a share link or bring your history from ChatGPT, Claude, Gemini and more. Your messages and context arrive intact.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229188/import_d8xvho.jpg",
	},
	{
		index: "02",
		title: "Switch models in one click",
		description:
			"Continue the same thread on a different model whenever you want. The context follows you, so nothing resets.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229140/anymodel_vdvx4h.jpg",
	},
	{
		index: "03",
		title: "One plan, every model",
		description:
			"Reach the top tier of each major model for a single price. No more stacking subscriptions you barely use.",
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
		title: "Talk in any language",
		description:
			"Record a voice note and get an accurate transcript that keeps the meaning, in the language you spoke. Useful for quick notes, interviews and ideas on the move.",
		image:
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781228978/audio_li1rdo.jpg",
	},
	{
		eyebrow: "Images",
		title: "Generate images in the chat",
		description:
			"Create images from a prompt without leaving the conversation, from product shots to character art. Iterate on a result until it is right.",
		images: [
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229272/woman-in-urban_hxvo2q.jpg",
			"https://res.cloudinary.com/dqovfvo29/image/upload/q_auto/f_auto/v1781229285/cute-face_lnxue9.webp",
		],
	},
	{
		eyebrow: "Video",
		title: "Turn a prompt into video",
		description:
			"Generate short, coherent video clips from a description and download them when you are happy. Available on the Pro plan.",
		videos: [
			"https://res.cloudinary.com/dqovfvo29/video/upload/q_auto/f_auto/v1781229447/pricess-knight_q3duzd.mp4",
			"https://res.cloudinary.com/dqovfvo29/video/upload/q_auto/f_auto/v1781229380/model_op05uz.mp4",
		],
	},
];
