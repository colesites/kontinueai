"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Bug, ExternalLink, Lightbulb } from "lucide-react";

type ContactCard = {
  title: string;
  description: string;
  href: string;
  isExternal?: boolean;
  icon?: ReactNode;
};

const CONTACT_CARDS: ContactCard[] = [
  {
    title: "Have a feature idea?",
    description: "Share product ideas the team and community can vote on.",
    href: "/feedback",
    icon: <Lightbulb className="h-3.5 w-3.5" />,
  },
  {
    title: "Found a bug?",
    description:
      "Report issues quickly with clear details and reproduction notes.",
    href: "/feedback",
    icon: <Bug className="h-3.5 w-3.5" />,
  },
  {
    title: "Privacy Policy",
    description: "How your data is handled.",
    href: "https://kontinueai.com/legal/privacy-policy",
    isExternal: true,
  },
  {
    title: "Terms of Service",
    description: "Usage terms and responsibilities.",
    href: "https://kontinueai.com/legal/terms-of-service",
    isExternal: true,
  },
];

export function SettingsContactCards() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {CONTACT_CARDS.map((card) => {
        return (
          <Link
            key={card.title}
            href={card.href}
            target={card.isExternal ? "_blank" : undefined}
            rel={card.isExternal ? "noopener noreferrer" : undefined}
            className="rounded-xl border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background"
          >
            <p className="inline-flex items-center gap-2 text-sm font-medium">
              {card.icon}
              {card.title}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {card.description}
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-xs text-primary">
              Open
              <ExternalLink className="h-3 w-3" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
