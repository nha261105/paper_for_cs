"""Search arXiv by topic, pick papers, download their PDFs.

    python fetcher.py "retrieval augmented generation" -c cs.CL -n 20 --sort date
    python fetcher.py -p rag
    python fetcher.py            (no arguments: step-by-step menus)
"""
import argparse
import re
import sys
import textwrap
import urllib.error
from datetime import date, timedelta
from pathlib import Path

from paperfetch import config, wizard
from paperfetch.models import Paper
from paperfetch.sources import arxiv
from paperfetch.storage import Library

FOLDER_PART = re.compile(r'[<>:"|?*\\\x00-\x1f]')
LAST_RE = re.compile(r"(\d+)\s*([dwmy])")
LAST_UNITS = {"d": 1, "w": 7, "m": 30, "y": 365}


def parse_args(argv=None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Tìm và tải paper PDF từ arXiv.")
    p.add_argument("query", nargs="?", help='chủ đề, vd "retrieval augmented generation" '
                                            '(hỗ trợ cú pháp arXiv: ti:, au:, abs:, AND/OR)')
    p.add_argument("-p", "--preset", help="dùng preset trong config.json")
    p.add_argument("--presets", action="store_true", help="liệt kê các preset rồi thoát")
    p.add_argument("-c", "--category", action="append", dest="categories",
                   help="lọc theo category, lặp lại được: -c cs.CL -c cs.LG")
    p.add_argument("-n", "--max-results", type=int, help="số kết quả mỗi trang (mặc định 10)")
    p.add_argument("-s", "--sort", choices=list(arxiv.SORT_MAP),
                   help="relevance = liên quan nhất, date = mới nộp nhất, "
                        "updated = mới cập nhật nhất, oldest = cũ nhất trước")
    p.add_argument("-i", "--in", dest="field", choices=list(arxiv.FIELD_MAP),
                   help="chỉ tìm trong tiêu đề / abstract / tác giả (mặc định: all)")
    p.add_argument("--since", help="nộp từ ngày YYYY-MM-DD")
    p.add_argument("--until", help="nộp đến ngày YYYY-MM-DD")
    p.add_argument("--last", help="trong khoảng gần đây: 7d, 2w, 3m, 1y")
    p.add_argument("-o", "--output", type=Path, help="thư mục gốc lưu PDF (ghi đè config)")
    p.add_argument("-f", "--folder", help="thư mục con để lưu, vd AI hoặc AI/NLP (bỏ qua bước hỏi)")
    p.add_argument("--config", type=Path, help="đường dẫn file config.json khác")
    return p.parse_args(argv)


def parse_date(text: str, name: str) -> date:
    try:
        return date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"{name}: cần dạng YYYY-MM-DD, nhận được {text!r}") from None


def parse_last(text: str) -> date:
    m = LAST_RE.fullmatch(text.strip().lower())
    if not m:
        raise ValueError(f"last: cần dạng 7d, 2w, 3m, 1y, nhận được {text!r}")
    return date.today() - timedelta(days=int(m.group(1)) * LAST_UNITS[m.group(2)])


def resolve_settings(args: argparse.Namespace, cfg: dict) -> dict:
    """defaults < config.json < preset < CLI flags. Raises ValueError."""
    preset = {}
    if args.preset:
        if args.preset not in cfg["presets"]:
            names = ", ".join(cfg["presets"]) or "(chưa có preset nào)"
            raise ValueError(f"không có preset {args.preset!r}. Có: {names}")
        preset = cfg["presets"][args.preset]

    def pick(key, cli_value):
        if cli_value is not None:
            return cli_value
        return preset[key] if key in preset else cfg.get(key)

    s = {
        "query": pick("query", args.query) or "",
        "categories": pick("categories", args.categories) or [],
        "max_results": pick("max_results", args.max_results),
        "sort": pick("sort", args.sort),
        "field": pick("field", args.field),
        "folder": pick("folder", args.folder),
    }
    if s["sort"] not in arxiv.SORT_MAP:
        raise ValueError(f"sort phải là một trong {list(arxiv.SORT_MAP)}")
    if s["field"] not in arxiv.FIELD_MAP:
        raise ValueError(f"field phải là một trong {list(arxiv.FIELD_MAP)}")

    # Any date flag on the command line replaces the preset's date range.
    dates = ({"since": args.since, "until": args.until, "last": args.last}
             if any((args.since, args.until, args.last)) else preset)
    s["since"] = parse_date(dates["since"], "since") if dates.get("since") else None
    s["until"] = parse_date(dates["until"], "until") if dates.get("until") else None
    if dates.get("last"):
        s["since"] = parse_last(dates["last"])

    if not s["query"] and not s["categories"]:
        raise ValueError("cần nhập chủ đề, category (-c) hoặc preset (-p)")
    return s


def parse_selection(text: str, count: int) -> list[int]:
    """'0 3 5', '2-6', '0,2-4', 'all' -> sorted unique indices. Raises ValueError."""
    text = text.strip().lower()
    if text == "all":
        return list(range(count))
    picked = set()
    for tok in re.split(r"[,\s]+", text):
        if not tok:
            continue
        if "-" in tok:
            a, b = (int(x) for x in tok.split("-", 1))
            if a > b:
                a, b = b, a
            picked.update(range(a, b + 1))
        else:
            picked.add(int(tok))
    bad = [i for i in picked if not 0 <= i < count]
    if bad:
        raise ValueError(f"số ngoài phạm vi 0-{count - 1}: {sorted(bad)}")
    return sorted(picked)


def clean_folder(name: str) -> str:
    parts = [FOLDER_PART.sub("_", p).strip(" .") for p in name.replace("\\", "/").split("/")]
    parts = [p for p in parts if p and p != ".."]
    return "/".join(parts)


def print_results(papers: list[Paper], lib: Library, offset: int = 0,
                  show_updated: bool = False) -> None:
    width = len(str(offset + len(papers) - 1))
    pad = " " * (width + 3)
    for i, p in enumerate(papers, offset):
        mark = "  [đã tải]" if lib.has(p) else ""
        cat = p.categories[0] if p.categories else "-"
        upd = f" (cập nhật {p.updated})" if show_updated and p.updated != p.published else ""
        print(f"[{i:>{width}}] {p.published}{upd}  {p.id}{p.version}  {cat}{mark}")
        print(f"{pad}{p.title}")
        print(f"{pad}{p.short_authors()}\n")


def print_abstract(i: int, p: Paper) -> None:
    print(f"\n[{i}] {p.title}")
    print(f"    {', '.join(p.authors)}")
    print(f"    https://arxiv.org/abs/{p.id}{p.version}  |  {' '.join(p.categories)}\n")
    print(textwrap.fill(p.summary or "(không có abstract)", width=90,
                        initial_indent="    ", subsequent_indent="    "))
    print()


def choose_folders(lib: Library, cfg: dict, todo: list[Paper]) -> dict[str, str]:
    """Ask where to save. Returns paper.id -> folder ("" = root)."""
    suggested = {p.id: config.folder_for_category(cfg, p.categories) or "" for p in todo}
    distinct = set(suggested.values())

    folders = lib.subfolders()
    print(f"Lưu vào thư mục nào trong {lib.root} ?")
    for i, name in enumerate(folders, 1):
        print(f"  {i}. {name}")

    if distinct == {""}:
        default_label = "thư mục gốc"
    elif len(distinct) == 1:
        default_label = f"{distinct.pop()} (gợi ý theo category)"
    else:
        print("  Gợi ý theo category:")
        for p in todo:
            print(f"    {p.id:<12} {p.categories[0] if p.categories else '-':<10} -> "
                  f"{suggested[p.id] or '(thư mục gốc)'}")
        default_label = "xếp theo gợi ý trên"

    while True:
        ans = input(f"Nhập số, hoặc gõ tên thư mục (vd AI/NLP), '.' = thư mục gốc. "
                    f"Enter = {default_label}: ").strip()
        if not ans:
            return suggested
        if ans == ".":
            return {p.id: "" for p in todo}
        if ans.isdigit():
            if 1 <= int(ans) <= len(folders):
                return {p.id: folders[int(ans) - 1] for p in todo}
            print("  Số không hợp lệ.")
            continue
        name = clean_folder(ans)
        if name:
            return {p.id: name for p in todo}
        print("  Tên thư mục không hợp lệ.")


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        cfg = config.load(args.config)
    except (OSError, ValueError) as e:
        print(f"Lỗi đọc config: {e}", file=sys.stderr)
        return 2

    search_flags = [args.query, args.preset, args.categories, args.max_results, args.sort,
                    args.field, args.since, args.until, args.last, args.output, args.folder]
    if not args.presets and all(v is None for v in search_flags):
        wizard_args = wizard.run(cfg)
        print("\nLệnh tương đương (lần sau chạy thẳng cho nhanh):")
        print("  python fetcher.py " + " ".join(f'"{a}"' if " " in a else a for a in wizard_args) + "\n")
        if args.config:
            wizard_args += ["--config", str(args.config)]
        args = parse_args(wizard_args)

    if args.presets:
        if not cfg["presets"]:
            print("Chưa có preset nào. Xem mục \"presets\" trong config.example.json.")
        for name, preset in cfg["presets"].items():
            print(f"{name:<15} {preset}")
        return 0

    try:
        s = resolve_settings(args, cfg)
    except ValueError as e:
        print(f"Lỗi: {e}", file=sys.stderr)
        return 2

    root = args.output.expanduser().resolve() if args.output else cfg["download_dir"]
    lib = Library(root)
    for name in cfg["folders"]:
        (root / clean_folder(name)).mkdir(parents=True, exist_ok=True)

    desc = [repr(s["query"]) if s["query"] else "(không có từ khoá)"]
    if s["field"] != "all":
        desc.append(f"trong: {s['field']}")
    if s["categories"]:
        desc.append(f"category: {', '.join(s['categories'])}")
    if s["since"] or s["until"]:
        desc.append(f"từ {s['since'] or '...'} đến {s['until'] or 'nay'}")
    desc.append(f"sort: {s['sort']}")
    print("Đang tìm trên arXiv: " + "  | ".join(desc) + "\n")

    def fetch(start: int) -> list[Paper]:
        return arxiv.search(s["query"], categories=s["categories"],
                            max_results=s["max_results"], sort=s["sort"],
                            field=s["field"], since=s["since"], until=s["until"],
                            start=start)

    try:
        papers = fetch(0)
    except (arxiv.ArxivError, urllib.error.URLError, TimeoutError) as e:
        print(f"Lỗi khi gọi arXiv API: {e}", file=sys.stderr)
        return 1
    if not papers:
        print("Không có kết quả.")
        return 0

    show_updated = s["sort"] == "updated"
    print_results(papers, lib, show_updated=show_updated)

    while True:
        ans = input("Chọn bài để tải (vd: 0 3 5 | 2-6 | all), m = thêm kết quả, "
                    "a <số> = xem abstract. Enter để thoát: ").strip()
        if not ans:
            return 0
        if ans.lower() == "m":
            try:
                seen = {p.id for p in papers}
                more = [p for p in fetch(len(papers)) if p.id not in seen]
            except (arxiv.ArxivError, urllib.error.URLError, TimeoutError) as e:
                print(f"  Lỗi khi gọi arXiv API: {e}")
                continue
            if not more:
                print("  Hết kết quả.")
                continue
            print()
            print_results(more, lib, offset=len(papers), show_updated=show_updated)
            papers += more
            continue
        abstract = re.fullmatch(r"a\s*([\d\s,-]+)", ans.lower())
        try:
            if abstract:
                for i in parse_selection(abstract.group(1), len(papers)):
                    print_abstract(i, papers[i])
                continue
            chosen = parse_selection(ans, len(papers))
            break
        except ValueError as e:
            print(f"  Không hợp lệ: {e}")

    todo = []
    for i in chosen:
        if lib.has(papers[i]):
            print(f"  Bỏ qua [{i}] {papers[i].id}: đã có trong thư viện.")
        else:
            todo.append(papers[i])
    if not todo:
        return 0

    if s["folder"] is not None:
        folder = clean_folder(s["folder"])
        targets = {p.id: folder for p in todo}
    else:
        targets = choose_folders(lib, cfg, todo)

    ok = 0
    for n, p in enumerate(todo, 1):
        print(f"({n}/{len(todo)}) Đang tải {p.id}{p.version} ...", end=" ", flush=True)
        try:
            pdf = arxiv.download_pdf(p)
            if not pdf.startswith(b"%PDF"):
                raise ValueError("phản hồi không phải PDF")
            path = lib.save(p, pdf, targets[p.id])
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
            print(f"LỖI: {e}")
            continue
        ok += 1
        print(f"OK -> {path.relative_to(root)} ({len(pdf) // 1024} KB)")

    print(f"\nĐã tải {ok}/{len(todo)} bài vào {root}. Metadata: {lib.index_path}")
    return 0 if ok == len(todo) else 1


if __name__ == "__main__":
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(errors="replace")
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print("\nĐã thoát.")
        sys.exit(130)
