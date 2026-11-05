import type { ReactNode } from "react";
import type { PaperBase } from "@/api";
import { cn } from "@/lib/utils";

export function absUrl(p: PaperBase) {
  return `https://arxiv.org/abs/${p.id}${p.version}`;
}

export function shortAuthors(authors: string[], n = 3) {
  return authors.slice(0, n).join(", ") + (authors.length > n ? ", et al." : "");
}

/** "Authors · 2024-05-01 · cs.CL · 2405.00001" on one wrapping line.
    Each "·" is glued to the item before it, so a wrapped line never starts with one. */
export function PaperMeta({ p, authors = 3, className }: { p: PaperBase; authors?: number; className?: string }) {
  const parts: ReactNode[] = [
    <span key="a" className="text-foreground/80">{shortAuthors(p.authors, authors)}</span>,
    <span key="d" className="tabular-nums">{p.published}</span>,
    p.categories[0] ? <span key="c">{p.categories.slice(0, 2).join(", ")}</span> : null,
    <a key="id" href={absUrl(p)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
       className="font-mono text-[12px] hover:text-brand hover:underline underline-offset-2">
      {p.id}{p.version}
    </a>,
  ].filter(Boolean);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted-foreground", className)}>
      {parts.map((part, i) => (
        <span key={i} className={cn(i > 0 && "whitespace-nowrap")}>
          {part}
          {i < parts.length - 1 && <span aria-hidden className="ml-1.5 text-muted-foreground/50">·</span>}
        </span>
      ))}
    </div>
  );
}
