"use client";

import { Play, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { easeTransition, fadeIn, getAnimationConfig } from "@/lib/animations";

export function VideoSection() {
	const [isOpen, setIsOpen] = useState(false);

	// Lock scroll when modal is open
	useEffect(() => {
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}
		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isOpen]);

	return (
		<section className="py-12 md:py-20 px-4 bg-white overflow-hidden">
			<div className="container mx-auto max-w-5xl">
				<motion.div
					initial={getAnimationConfig(fadeIn.initial)}
					whileInView={getAnimationConfig(fadeIn.animate)}
					viewport={{ once: true, margin: "-100px" }}
					transition={easeTransition}
					className="relative group cursor-pointer"
					onClick={() => setIsOpen(true)}
				>
					{/* Main Preview Card */}
					<div className="relative rounded-4xl md:rounded-[3rem] overflow-hidden shadow-[0_48px_100px_-20px_rgba(0,0,0,0.15)] bg-gray-100 aspect-video">
						{/* Preview Background - Using a dimmed first frame if possible, or just a sleek gradient placeholder */}
						<div className="absolute inset-0 bg-linear-to-br from-gray-800 to-black flex items-center justify-center overflow-hidden">
							{/* Video frame as a preview (muted, no autoplay) */}
							<video
								src="/video.mp4"
								className="w-full h-full object-cover opacity-60 grayscale-[0.2]"
								preload="auto"
								muted
								playsInline
							>
								<track kind="captions" />
							</video>
							<div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
						</div>

						{/* Play Button Overlay */}
						<div className="absolute inset-0 flex items-center justify-center">
							<div className="w-16 h-16 md:w-24 md:h-24 rounded-full border-2 border-white/60 flex items-center justify-center backdrop-blur-md bg-white/20 group-hover:scale-110 transition-transform duration-300 shadow-xl">
								<Play className="w-6 h-6 md:w-10 md:h-10 text-white fill-white pl-1 opacity-90" />
							</div>
						</div>
					</div>

					{/* Decorative soft glow behind video */}
					<div className="absolute -inset-10 bg-linear-to-r from-violet-500/5 to-purple-500/5 blur-3xl -z-10 rounded-[4rem]" />
				</motion.div>
			</div>

			{/* Video Modal */}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 sm:p-6 md:p-12 lg:p-20"
						onClick={() => setIsOpen(false)}
					>
						<motion.div
							initial={{ scale: 0.9, opacity: 0 }}
							animate={{ scale: 1, opacity: 1 }}
							exit={{ scale: 0.9, opacity: 0 }}
							className="relative w-full max-w-6xl max-h-[80vh] md:max-h-[85vh] rounded-xl sm:rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl bg-black"
							onClick={(e) => e.stopPropagation()}
						>
							{/* Close Button */}
							<button
								onClick={() => setIsOpen(false)}
								className="absolute top-2 right-2 sm:top-4 sm:right-4 z-110 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
								type="button"
							>
								<X className="w-5 h-5 sm:w-6 sm:h-6" />
							</button>

							<video
								src="/video.mp4"
								className="w-full h-full max-h-[80vh] md:max-h-[85vh] object-contain"
								controls
								autoPlay
								playsInline
							>
								<track kind="captions" />
							</video>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}
