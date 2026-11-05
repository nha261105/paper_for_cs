import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export function Tip({ label, children, side = "bottom" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6}
          className="z-50 flex items-center gap-1.5 rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-md">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
