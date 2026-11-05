import { BookOpen, Library, Monitor, Moon, RefreshCw, Search, Sun } from "lucide-react";
import { useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";
import { CommandPalette, useSlashToFocus } from "@/components/CommandPalette";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/input";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { cn, modKey } from "@/lib/utils";
import { LibraryPage } from "@/pages/LibraryPage";
import { ReaderPage } from "@/pages/ReaderPage";
import { SearchPage } from "@/pages/SearchPage";
import { useStore } from "@/store";
import { useTheme, type Theme } from "@/theme";

function NavItem({ to, icon: Icon, label, count }: { to: string; icon: typeof Search; label: string; count?: number }) {
  return (
    <NavLink to={to} end={to === "/"}
      className={({ isActive }) => cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60",
        isActive ? "bg-card text-foreground shadow-xs ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}>
      <Icon className="size-4" />
      <span className="max-md:hidden">{label}</span>
      {count !== undefined && count > 0 && <span className="ml-auto text-xs tabular-nums text-muted-foreground max-md:hidden">{count}</span>}
    </NavLink>
  );
}

const THEME_ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

function ThemeMenu() {
  const { theme, setTheme } = useTheme();
  const Icon = THEME_ICON[theme];
  return (
    <DropdownMenu>
      <Tip label="Giao diện" side="right">
        <DropdownMenuTrigger asChild>
          <Button variant="subtle" size="icon-sm" aria-label="Đổi giao diện sáng / tối"><Icon /></Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <DropdownMenuRadioItem value="light"><Sun />Sáng</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark"><Moon />Tối</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system"><Monitor />Theo hệ thống</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function App() {
  const { library, refresh } = useStore();
  const { theme } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reading = library.filter((p) => p.status === "reading").length;
  const inReader = useLocation().pathname.startsWith("/read");
  useSlashToFocus();

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full max-md:flex-col">
        <aside className={cn(
          "flex shrink-0 flex-col gap-1 border-border bg-background p-3",
          "md:w-56 md:border-r max-md:flex-row max-md:items-center max-md:border-b max-md:py-2",
          inReader && "md:w-14 md:items-center",
        )}>
          <div className={cn("mb-4 flex items-center gap-2 px-2.5 pt-1 max-md:hidden", inReader && "md:px-0")}>
            <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">P</span>
            {!inReader && <span className="text-sm font-semibold tracking-tight">paper_for_cs</span>}
          </div>
          {!inReader && (
            <button type="button" onClick={() => setPaletteOpen(true)}
              className="mb-3 flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm text-muted-foreground shadow-xs outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:hidden">
              <Search className="size-3.5" />
              <span>Tìm nhanh…</span>
              <span className="ml-auto flex gap-0.5"><Kbd>{modKey}</Kbd><Kbd>K</Kbd></span>
            </button>
          )}
          <nav aria-label="Điều hướng chính" className={cn("flex gap-0.5 md:flex-col", inReader && "md:items-center")}>
            {inReader ? (
              <>
                <Tip label="Tìm kiếm" side="right"><span><NavItem to="/" icon={Search} label="" /></span></Tip>
                <Tip label="Thư viện" side="right"><span><NavItem to="/library" icon={Library} label="" /></span></Tip>
                <Tip label="Đọc" side="right"><span><NavItem to="/read" icon={BookOpen} label="" /></span></Tip>
              </>
            ) : (
              <>
                <NavItem to="/" icon={Search} label="Tìm kiếm" />
                <NavItem to="/library" icon={Library} label="Thư viện" count={library.length} />
                <NavItem to="/read" icon={BookOpen} label="Đang đọc" count={reading} />
              </>
            )}
          </nav>
          <div className={cn("mt-auto flex items-center gap-1 max-md:mt-0 max-md:ml-auto", inReader && "md:flex-col")}>
            <ThemeMenu key={theme} />
            <Tip label="Làm mới: đọc lại config.json, nhận bài tải bằng CLI" side="right">
              <Button variant="subtle" size="icon-sm" aria-label="Làm mới" disabled={refreshing}
                onClick={async () => { setRefreshing(true); await refresh(true); setRefreshing(false); }}>
                <RefreshCw className={cn(refreshing && "animate-spin")} />
              </Button>
            </Tip>
          </div>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/read" element={<ReaderPage onOpenPalette={() => setPaletteOpen(true)} />} />
            <Route path="*" element={<SearchPage />} />
          </Routes>
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <Toaster position="bottom-right" theme={theme} richColors closeButton />
    </TooltipProvider>
  );
}
