"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Reveal } from "@/components/anim/Reveal";
import { faqs } from "@/data/faqs";
import { faqSchema, JsonLd } from "@/lib/structured-data";

export function FAQSection() {
	const [open, setOpen] = useState<number | null>(0);

	return (
		<section id="faq" className="bg-background py-24 lg:py-32">
			<JsonLd data={faqSchema(faqs)} />
			<div className="mx-auto max-w-3xl px-5 lg:px-8">
				<Reveal className="text-center">
					<p className="eyebrow">FAQ</p>
					<h2 className="font-display tracking-tightest mt-5 text-4xl leading-[1.06] sm:text-5xl">
						Questions, answered
					</h2>
				</Reveal>

				<Reveal stagger={0.07} className="mt-14 border-t border-border">
					{faqs.map((faq, i) => {
						const isOpen = open === i;
						return (
							<div
								key={faq.question}
								data-anim
								className="border-b border-border"
							>
								<button
									type="button"
									aria-expanded={isOpen}
									onClick={() => setOpen(isOpen ? null : i)}
									className="flex w-full items-center justify-between gap-6 py-6 text-left"
								>
									<span className="font-display text-lg tracking-tight sm:text-xl">
										{faq.question}
									</span>
									<span className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-foreground transition-colors">
										{isOpen ? (
											<Minus className="size-4" />
										) : (
											<Plus className="size-4" />
										)}
									</span>
								</button>
								<div
									className={`grid transition-all duration-300 ease-out ${
										isOpen
											? "grid-rows-[1fr] opacity-100"
											: "grid-rows-[0fr] opacity-0"
									}`}
								>
									<div className="overflow-hidden">
										<p className="max-w-2xl pb-6 pr-10 text-base leading-relaxed text-muted-foreground">
											{faq.answer}
										</p>
									</div>
								</div>
							</div>
						);
					})}
				</Reveal>
			</div>
		</section>
	);
}
