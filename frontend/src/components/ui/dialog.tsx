import { X } from "lucide-react";
import { Dialog as D } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTitle = D.Title;
export const DialogDescription = D.Description;

function Overlay({ className, ...props }: ComponentProps<typeof D.Overlay>) {
  return <D.Overlay className={cn("fixed inset-0 z-50 bg-black/25 dark:bg-black/50", className)} {...props} />;
}

/** Centered dialog (used by the command palette). */
export function DialogContent({ className, children, ...props }: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <Overlay />
      <D.Content
        className={cn(
          "fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        {children}
      </D.Content>
    </D.Portal>
  );
}

/** Panel that slides in from the right (paper details). */
export function SheetContent({ className, children, title, ...props }: ComponentProps<typeof D.Content> & { title: string }) {
  return (
    <D.Portal>
      <Overlay className="bg-black/10 dark:bg-black/40" />
      <D.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col border-l bg-card shadow-2xl outline-none",
          className,
        )}
        {...props}
      >
        <D.Title className="sr-only">{title}</D.Title>
        <D.Description className="sr-only">Chi tiết và ghi chú của bài</D.Description>
        {children}
        <D.Close className="absolute top-3 right-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 outline-none" aria-label="Đóng">
          <X className="size-4" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
