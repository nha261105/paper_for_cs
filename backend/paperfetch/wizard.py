"""Step-by-step menus for when fetcher.py is run without arguments.
Builds the equivalent command-line arguments so the normal path does the rest."""
from datetime import date

CATEGORIES = [
    ("cs.CL", "NLP / ngôn ngữ"),
    ("cs.CV", "Thị giác máy tính"),
    ("cs.LG", "Machine Learning"),
    ("cs.AI", "Trí tuệ nhân tạo"),
    ("cs.IR", "Truy xuất thông tin / tìm kiếm"),
    ("cs.RO", "Robotics"),
    ("cs.CR", "Bảo mật"),
    ("cs.SE", "Kỹ thuật phần mềm"),
    ("cs.DC", "Hệ phân tán / tính toán song song"),
    ("cs.DB", "Cơ sở dữ liệu"),
    ("cs.HC", "Tương tác người - máy"),
    ("stat.ML", "Thống kê - Machine Learning"),
]
FIELDS = [("Mọi nơi", "all"), ("Tiêu đề", "title"), ("Abstract", "abstract"), ("Tác giả", "author")]
SORTS = [("Liên quan nhất", "relevance"), ("Mới nhất", "date"),
         ("Mới cập nhật nhất", "updated"), ("Cũ nhất trước", "oldest")]
PERIODS = [("Không giới hạn", None), ("7 ngày qua", "7d"), ("30 ngày qua", "30d"),
           ("6 tháng qua", "6m"), ("1 năm qua", "1y"), ("Tự nhập khoảng ngày", "custom")]


def ask_choice(title: str, options: list[tuple[str, object]], default: int = 0):
    print(f"\n{title}")
    for i, (label, _) in enumerate(options, 1):
        print(f"  {i}. {label}" + ("  (mặc định)" if i - 1 == default else ""))
    while True:
        ans = input("> ").strip()
        if not ans:
            return options[default][1]
        if ans.isdigit() and 1 <= int(ans) <= len(options):
            return options[int(ans) - 1][1]
        print(f"  Nhập số từ 1 đến {len(options)}, hoặc Enter.")


def ask_categories() -> list[str]:
    print("\nLĩnh vực (chọn nhiều được, vd: 1 3; hoặc gõ mã như cs.DB). Enter = tất cả:")
    for i, (code, label) in enumerate(CATEGORIES, 1):
        print(f"  {i:>2}. {code:<8} {label}")
    while True:
        tokens = input("> ").replace(",", " ").split()
        picked, bad = [], []
        for t in tokens:
            if t.isdigit() and 1 <= int(t) <= len(CATEGORIES):
                picked.append(CATEGORIES[int(t) - 1][0])
            elif "." in t:
                picked.append(t)
            else:
                bad.append(t)
        if not bad:
            return list(dict.fromkeys(picked))
        print(f"  Không hiểu: {' '.join(bad)}")


def ask_date(prompt: str) -> str | None:
    while True:
        ans = input(prompt).strip()
        if not ans:
            return None
        try:
            date.fromisoformat(ans)
            return ans
        except ValueError:
            print("  Cần dạng YYYY-MM-DD, vd 2024-01-31.")


def ask_int(prompt: str, default: int) -> int:
    while True:
        ans = input(prompt).strip()
        if not ans:
            return default
        if ans.isdigit() and int(ans) > 0:
            return int(ans)
        print("  Nhập một số dương.")


def run(cfg: dict) -> list[str]:
    """Ask the user step by step; return fetcher.py arguments."""
    print("=== Tìm paper trên arXiv ===  (Enter = dùng mặc định, Ctrl+C = thoát)")

    presets = list(cfg["presets"])
    if presets:
        options = [("Tìm mới", None)] + [(f"Preset: {name}", name) for name in presets]
        preset = ask_choice("Bắt đầu từ:", options)
        if preset:
            return ["-p", preset]

    while True:
        query = input("\nChủ đề muốn tìm (vd: retrieval augmented generation): ").strip()
        args = [query] if query else []
        if query:
            field = ask_choice("Tìm từ khoá ở đâu?", FIELDS)
            if field != "all":
                args += ["-i", field]
        categories = ask_categories()
        if query or categories:
            break
        print("  Cần nhập ít nhất chủ đề hoặc chọn một lĩnh vực.")
    for c in categories:
        args += ["-c", c]

    sort_names = [value for _, value in SORTS]
    default_sort = sort_names.index(cfg["sort"]) if cfg["sort"] in sort_names else 0
    sort = ask_choice("Sắp xếp theo:", SORTS, default_sort)
    args += ["-s", sort]

    period = ask_choice("Thời gian nộp bài:", PERIODS)
    if period == "custom":
        since = ask_date("  Từ ngày (YYYY-MM-DD, Enter = không giới hạn): ")
        until = ask_date("  Đến ngày (YYYY-MM-DD, Enter = hôm nay): ")
        args += (["--since", since] if since else []) + (["--until", until] if until else [])
    elif period:
        args += ["--last", period]

    n = ask_int(f"\nSố kết quả mỗi trang [{cfg['max_results']}]: ", cfg["max_results"])
    if n != cfg["max_results"]:
        args += ["-n", str(n)]
    return args
