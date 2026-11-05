import { Check } from "lucide-react";
import { DropdownMenu as D } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = D.Root;
export const DropdownMenuTrigger = D.Trigger;
export const DropdownMenuRadioGroup = D.RadioGroup;

export function DropdownMenuContent({ className, sideOffset = 6, align = "start", ...props }: ComponentProps<typeof D.Content>) {
  return (
    <D.Portal>
      <D.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 min-w-44 rounded-lg border bg-popover p-1 text-sm shadow-lg", className)}
        {...props}
      />
    </D.Portal>
  );
}

const itemClass =
  "relative flex cursor-default select-none items-center gap-2 rounded-md px-2 py-1.5 outline-none " +
  "data-[highlighted]:bg-muted data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground";

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof D.Item>) {
  return <D.Item className={cn(itemClass, className)} {...props} />;
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof D.RadioItem>) {
  return (
    <D.RadioItem className={cn(itemClass, "pr-8", className)} {...props}>
      {children}
      <D.ItemIndicator className="absolute right-2 flex items-center">
        <Check className="!text-foreground" />
      </D.ItemIndicator>
    </D.RadioItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof D.Label>) {
  return <D.Label className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)} {...props} />;
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof D.Separator>) {
  return <D.Separator className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />;
}
