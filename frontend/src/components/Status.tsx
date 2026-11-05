import { ChevronDown } from "lucide-react";
import type { Status } from "@/api";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "./ui/dropdown-menu";

export const STATUS_ORDER: Status[] = ["unread", "reading", "done"];
export const STATUS_LABEL: Record<Status, string> = { unread: "Chưa đọc", reading: "Đang đọc", done: "Đã đọc" };

const DOT: Record<Status, string> = {
  unread: "border border-unread bg-transparent",
  reading: "bg-reading",
  done: "bg-done",
};

export function StatusDot({ status, className }: { status: Status; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full", DOT[status], className)} />;
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Segmented control: three statuses, one click each. */
export function StatusSegmented({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <div role="radiogroup" aria-label="Trạng thái đọc" className="grid grid-cols-3 rounded-lg bg-muted p-0.5">
      {STATUS_ORDER.map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} onClick={() => onChange(s)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            value === s ? "bg-card text-foreground shadow-xs" : "hover:text-foreground",
          )}>
          <StatusDot status={s} />
          {STATUS_LABEL[s]}
        </button>
      ))}
    </div>
  );
}

/** Compact pill with a menu (reader toolbar). */
export function StatusMenu({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-[13px] font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60">
        <StatusDot status={value} />
        {STATUS_LABEL[value]}
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={value} onValueChange={(v) => onChange(v as Status)}>
          {STATUS_ORDER.map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              <StatusDot status={s} /> {STATUS_LABEL[s]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

