import { BookOpen, Library, Monitor, Moon, RefreshCw, Search, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isTyping } from "@/lib/utils";
import { useStore } from "@/store";
import { useTheme } from "@/theme";
import { StatusDot } from "./Status";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

function wordFilter(value: string, search: string) {
  const hay = value.toLowerCase();
  return search.toLowerCase().split(/\s+/).every((w) => hay.includes(w)) ? 1 : 0;
}

/** Ctrl/⌘+K: jump to any page or any paper in the library. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { library, refresh } = useStore();
  const { setTheme } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => { if (!open) setQuery(""); }, [open]);

  const papers = useMemo(
    () => [...library].sort((a, b) => b.last_opened.localeCompare(a.last_opened) || b.downloaded_at.localeCompare(a.downloaded_at)),
    [library],
  );
  const go = (fn: () => void) => { onOpenChange(false); fn(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle className="sr-only">Tìm nhanh</DialogTitle>
        <DialogDescription className="sr-only">Đi tới trang hoặc mở một bài trong thư viện</DialogDescription>
        <Command loop filter={wordFilter}>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Tìm bài trong thư viện, trang, lệnh…" />
          <CommandList>
            <CommandEmpty>Không thấy gì khớp.</CommandEmpty>
            {papers.length > 0 && (
              <CommandGroup heading="Mở để đọc">
                {papers.map((p) => (
                  <CommandItem key={p.key} value={`${p.title} ${p.authors.join(" ")} ${p.id} ${p.tags.join(" ")}`}
                    onSelect={() => go(() => navigate(`/read?key=${encodeURIComponent(p.key)}`))}>
                    <StatusDot status={p.status} />
                    <span className="truncate">{p.title}</span>
                    <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">{p.published.slice(0, 4)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Đi tới">
              <CommandItem value="tìm kiếm search arxiv" onSelect={() => go(() => navigate("/"))}><Search />Tìm paper trên arXiv</CommandItem>
              <CommandItem value="thư viện library" onSelect={() => go(() => navigate("/library"))}><Library />Thư viện</CommandItem>
              <CommandItem value="đọc reader" onSelect={() => go(() => navigate("/read"))}><BookOpen />Bài đọc gần nhất</CommandItem>
            </CommandGroup>
            <CommandGroup heading="Lệnh">
              <CommandItem value="làm mới refresh reload" onSelect={() => go(() => refresh(true))}><RefreshCw />Làm mới (đọc lại config, nhận bài tải bằng CLI)</CommandItem>
              <CommandItem value="giao diện sáng light theme" onSelect={() => go(() => setTheme("light"))}><Sun />Giao diện sáng</CommandItem>
              <CommandItem value="giao diện tối dark theme" onSelect={() => go(() => setTheme("dark"))}><Moon />Giao diện tối</CommandItem>
              <CommandItem value="giao diện theo hệ thống system theme" onSelect={() => go(() => setTheme("system"))}><Monitor />Giao diện theo hệ thống</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Global "/" focuses the page's main search box (element with data-search-focus). */
export function useSlashToFocus() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || isTyping(e) || e.metaKey || e.ctrlKey) return;
      const el = document.querySelector<HTMLInputElement>("[data-search-focus]");
      if (el) { e.preventDefault(); el.focus(); el.select(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
