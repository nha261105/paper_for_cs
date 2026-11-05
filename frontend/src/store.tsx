import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type LibraryItem, type Meta, type Patch, type SearchParams, type SearchResult } from "./api";

/** Everything typed into the search form. Lives in the store so it survives page changes. */
export interface SearchForm {
  query: string; field: string; categories: string[]; sort: string;
  period: string; since: string; until: string; max_results: number; folder: string;
}

export interface SearchState {
  params: SearchParams | null;
  results: SearchResult[];
  exhausted: boolean;
}

interface Store {
  meta: Meta | null;
  library: LibraryItem[];
  libraryLoaded: boolean;
  setError: (msg: string) => void;
  refresh: (reloadConfig?: boolean) => Promise<void>;
  update: (key: string, patch: Patch) => Promise<void>;
  markOpened: (key: string) => Promise<void>;
  addToLibrary: (item: LibraryItem) => void;
  search: SearchState;
  setSearch: (s: SearchState) => void;
  searchForm: SearchForm | null;
  setSearchForm: (f: SearchForm) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  // Errors show up as toasts (see <Toaster/> in App).
  const setError = useCallback((msg: string) => { if (msg) toast.error(msg); }, []);
  const [search, setSearch] = useState<SearchState>({ params: null, results: [], exhausted: false });
  const [searchForm, setSearchForm] = useState<SearchForm | null>(null);

  // Build the form from config.json defaults once they have loaded (not before,
  // or the defaults would be missed on the first visit).
  useEffect(() => {
    if (!meta || searchForm) return;
    const d = meta.defaults;
    setSearchForm({
      query: "", field: d.field, categories: d.categories, sort: d.sort,
      period: "any", since: "", until: "", max_results: d.max_results, folder: "",
    });
  }, [meta, searchForm]);

  const refresh = useCallback(async (reloadConfig = false) => {
    try {
      if (reloadConfig) await api.reload();
      const [m, lib] = await Promise.all([api.meta(), api.library()]);
      setMeta(m);
      setLibrary(lib);
      setLibraryLoaded(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const replace = useCallback((item: LibraryItem) => {
    setLibrary((lib) => lib.map((p) => (p.key === item.key ? item : p)));
  }, []);

  const update = useCallback(
    async (key: string, patch: Patch) => {
      // Optimistic: the UI changes at once, the server answer then confirms it.
      setLibrary((lib) => lib.map((p) => (p.key === key ? { ...p, ...patch } : p)));
      try {
        replace(await api.update(key, patch));
        if (patch.tags) setMeta((m) => m && { ...m, tags: [...new Set([...m.tags, ...patch.tags!])].sort() });
      } catch (e) {
        setError((e as Error).message);
        refresh();
      }
    },
    [replace, refresh],
  );

  const markOpened = useCallback(
    async (key: string) => {
      try {
        replace(await api.opened(key));
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [replace],
  );

  const addToLibrary = useCallback((item: LibraryItem) => {
    setLibrary((lib) => [item, ...lib.filter((p) => p.key !== item.key)]);
    setSearch((s) => ({ ...s, results: s.results.map((r) => (r.key === item.key ? { ...r, in_library: true } : r)) }));
    setMeta((m) => (m && item.folder && !m.folders.includes(item.folder) ? { ...m, folders: [...m.folders, item.folder].sort() } : m));
  }, []);

  const value = useMemo(
    () => ({ meta, library, libraryLoaded, setError, refresh, update, markOpened, addToLibrary,
      search, setSearch, searchForm, setSearchForm }),
    [meta, library, libraryLoaded, setError, refresh, update, markOpened, addToLibrary, search, searchForm],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
