"use client";

import { useState } from "react";
import { LuShare } from "react-icons/lu";
import { Button } from "@repo/ui/components/ui/button";
import { ShareModal } from "./ShareModal";
import { cn } from "@repo/ui/lib/utils";

interface ShareButtonProps {
  chatId: string;
  chatTitle: string;
}

export function ShareButton({
  chatId,
  chatTitle,
  className,
}: ShareButtonProps & { className?: string }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 items-center justify-center rounded-lg text-foreground/85 transition-colors hover:text-foreground hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
          className,
        )}
        onClick={() => setIsModalOpen(true)}
        aria-label="Share chat"
      >
        <LuShare className="h-[1.2rem] w-[1.2rem]" />
      </Button>
      <ShareModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        chatId={chatId}
        chatTitle={chatTitle}
      />
    </>
  );
}
