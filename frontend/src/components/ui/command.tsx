import { Command as C } from "cmdk";
import { Search } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Command({ className, ...props }: ComponentProps<typeof C>) {
  return <C className={cn("flex h-full w-full flex-col overflow-hidden bg-popover text-sm", className)} {...props} />;
}

export function CommandInput({ className, ...props }: ComponentProps<typeof C.Input>) {
  return (
    <div className="flex items-center gap-2 border-b px-3">
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <C.Input
        className={cn("h-11 w-full bg-transparent outline-none placeholder:text-muted-foreground", className)}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof C.List>) {
  return <C.List className={cn("max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain p-1", className)} {...props} />;
}

export function CommandEmpty(props: ComponentProps<typeof C.Empty>) {
  return <C.Empty className="py-8 text-center text-muted-foreground" {...props} />;
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof C.Group>) {
  return (
    <C.Group
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof C.Item>) {
  return (
    <C.Item
      className={cn(
        "flex cursor-default select-none items-center gap-2.5 rounded-md px-2 py-2 outline-none",
        "data-[selected=true]:bg-muted data-[disabled=true]:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export const CommandSeparator = (props: ComponentProps<typeof C.Separator>) => (
  <C.Separator className="-mx-1 my-1 h-px bg-border" {...props} />
);
