import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// The type scale in globals.css (@theme --text-*). tailwind-merge has to know
// these are font sizes: otherwise it reads `text-label` as a colour and drops
// it when a real colour (`text-muted-foreground`) follows.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "caption", "label", "body", "lead"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
