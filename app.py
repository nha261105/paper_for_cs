"""Local web app to search arXiv, keep a reading library and read PDFs.

    pip install -r requirements.txt
    streamlit run app.py
"""
import urllib.error
from datetime import date, timedelta
from pathlib import Path

import streamlit as st

from paperfetch import config
from paperfetch.db import STATUSES, ReadingDB
from paperfetch.models import Paper
from paperfetch.sources import arxiv
from paperfetch.storage import Library, clean_folder
from paperfetch.wizard import CATEGORIES

st.set_page_config(page_title="Paper for CS", page_icon="📚", layout="wide")

CATEGORY_LABELS = dict(CATEGORIES)
FIELDS = {"all": "Mọi nơi", "title": "Tiêu đề", "abstract": "Abstract", "author": "Tác giả"}
SORTS = {"relevance": "Liên quan nhất", "date": "Mới nộp nhất",
         "updated": "Mới cập nhật nhất", "oldest": "Cũ nhất trước"}
PERIODS = {"any": "Không giới hạn", "7": "7 ngày qua", "30": "30 ngày qua",
           "180": "6 tháng qua", "365": "1 năm qua", "custom": "Tự chọn khoảng ngày"}
STATUS_ICONS = {"unread": "⚪", "reading": "🟡", "done": "🟢"}
NET_ERRORS = (arxiv.ArxivError, urllib.error.URLError, TimeoutError)


# ---------------------------------------------------------------- shared state
@st.cache_resource
def load_app():
    cfg = config.load()
    root = cfg["download_dir"]
    for name in cfg["folders"]:
        (root / clean_folder(name)).mkdir(parents=True, exist_ok=True)
    db = ReadingDB(root)
    db.sync_from_index()
    return cfg, Library(root), db


try:
    CFG, LIB, DB = load_app()
except (OSError, ValueError) as e:
    st.error(f"Lỗi đọc config.json: {e}")
    st.stop()
ROOT: Path = CFG["download_dir"]


def category_label(code: str) -> str:
    return f"{code} · {CATEGORY_LABELS[code]}" if code in CATEGORY_LABELS else code


def open_reader(key: str) -> None:
    st.session_state.reading = key
    st.switch_page(PAGES["read"])


def download(paper: Paper, folder: str) -> Path:
    pdf = arxiv.download_pdf(paper)
    if not pdf.startswith(b"%PDF"):
        raise ValueError("phản hồi không phải PDF")
    path = LIB.save(paper, pdf, folder)
    DB.add(paper, path.relative_to(ROOT).as_posix())
    return path


def paper_editor(p: dict, prefix: str) -> None:
    """Status / star / tags / notes for one library paper. Saves immediately."""
    key = p["key"]
    w = f"{prefix}:{key}"

    def save(field, widget, convert=lambda v: v):
        DB.update(key, **{field: convert(st.session_state[widget])})

    st.pills("Trạng thái", list(STATUSES), default=p["status"],
                         format_func=lambda s: f"{STATUS_ICONS[s]} {STATUSES[s]}",
                         key=f"{w}:status", on_change=save,
                         args=("status", f"{w}:status", lambda v: v or "unread"))
    st.toggle("⭐ Đánh dấu bài hay", value=p["starred"], key=f"{w}:star",
              on_change=save, args=("starred", f"{w}:star", int))
    st.multiselect("Tags", sorted(set(DB.all_tags()) | set(p["tags"]), key=str.lower),
                   default=p["tags"], accept_new_options=True, key=f"{w}:tags",
                   placeholder="Gõ để thêm tag mới…", on_change=save,
                   args=("tags", f"{w}:tags"))
    with st.form(f"{w}:notes_form", border=False):
        notes = st.text_area("Ghi chú (hỗ trợ Markdown)", value=p["notes"], height=260,
                             key=f"{w}:notes")
        if st.form_submit_button("💾 Lưu ghi chú"):
            DB.update(key, notes=notes)
            st.toast("Đã lưu ghi chú")
    if p["notes"]:
        with st.expander("Xem ghi chú dạng Markdown"):
            st.markdown(p["notes"])


def paper_meta(p: dict) -> None:
    cats = " ".join(f"`{c}`" for c in p["categories"])
    st.caption(f"{', '.join(p['authors'])}  \n📅 {p['published']}  ·  "
               f"[{p['id']}{p['version']}](https://arxiv.org/abs/{p['id']}{p['version']})  ·  {cats}")


# ---------------------------------------------------------------- search page
def apply_preset() -> None:
    name = st.session_state.preset
    if not name:
        return
    pr = CFG["presets"][name]
    st.session_state.q = pr.get("query", "")
    st.session_state.cats = pr.get("categories", [])
    st.session_state.field = pr.get("field", CFG["field"])
    st.session_state.sort = pr.get("sort", CFG["sort"])
    st.session_state.n = pr.get("max_results", CFG["max_results"])
    last = pr.get("last")
    if last:
        n, unit = int(last[:-1]), last[-1].lower()
        st.session_state.since = date.today() - timedelta(days=n * {"d": 1, "w": 7, "m": 30, "y": 365}[unit])
        st.session_state.until = date.today()
        st.session_state.period = "custom"
    elif pr.get("since") or pr.get("until"):
        st.session_state.since = date.fromisoformat(pr["since"]) if pr.get("since") else None
        st.session_state.until = date.fromisoformat(pr["until"]) if pr.get("until") else None
        st.session_state.period = "custom"
    else:
        st.session_state.period = "any"
    if pr.get("folder"):
        st.session_state.folder_new = pr["folder"]


def run_search(params: dict, start: int = 0) -> list[Paper]:
    return arxiv.search(params["query"], categories=params["categories"],
                        max_results=params["max_results"], sort=params["sort"],
                        field=params["field"], since=params["since"],
                        until=params["until"], start=start)


SEARCH_DEFAULTS = {"q": "", "field": CFG["field"], "cats": CFG["categories"], "sort": CFG["sort"],
                   "period": "any", "n": CFG["max_results"], "since": None, "until": None}


def page_search() -> None:
    st.title("🔎 Tìm paper trên arXiv")
    for k, v in SEARCH_DEFAULTS.items():
        st.session_state.setdefault(k, v)
    DB.sync_from_index()

    if CFG["presets"]:
        st.selectbox("Bắt đầu từ preset", [""] + list(CFG["presets"]), key="preset",
                     format_func=lambda x: x or "— tìm mới —", on_change=apply_preset)

    with st.form("search_form"):
        c1, c2 = st.columns([3, 1])
        query = c1.text_input("Chủ đề", key="q",
                              placeholder='vd: retrieval augmented generation, hoặc ti:"diffusion" AND au:Ho')
        field = c2.selectbox("Tìm trong", list(FIELDS), format_func=FIELDS.get, key="field")
        cats = st.multiselect("Lĩnh vực (để trống = tất cả; gõ mã khác như cs.DB để thêm)",
                              list(dict.fromkeys([c for c, _ in CATEGORIES] + st.session_state.cats)),
                              format_func=category_label, accept_new_options=True, key="cats")
        c1, c2, c3 = st.columns(3)
        sort = c1.selectbox("Sắp xếp", list(SORTS), format_func=SORTS.get, key="sort")
        period = c2.selectbox("Thời gian nộp", list(PERIODS), format_func=PERIODS.get, key="period")
        n = c3.number_input("Số kết quả mỗi trang", 1, 200, key="n")
        c1, c2, _ = st.columns(3)
        since = c1.date_input("Từ ngày (khi tự chọn)", key="since")
        until = c2.date_input("Đến ngày (khi tự chọn)", key="until")
        submitted = st.form_submit_button("Tìm", type="primary", icon="🔎")

    if submitted:
        if not query.strip() and not cats:
            st.warning("Cần nhập chủ đề hoặc chọn ít nhất một lĩnh vực.")
        else:
            if period == "custom":
                lo, hi = since, until
            elif period == "any":
                lo, hi = None, None
            else:
                lo, hi = date.today() - timedelta(days=int(period)), None
            params = {"query": query.strip(), "categories": cats, "field": field, "sort": sort,
                      "max_results": int(n), "since": lo, "until": hi}
            try:
                with st.spinner("Đang hỏi arXiv…"):
                    results = run_search(params)
                st.session_state.search = {"params": params, "results": results, "exhausted": False}
            except NET_ERRORS as e:
                st.error(f"Lỗi khi gọi arXiv API: {e}")

    state = st.session_state.get("search")
    if not state:
        st.info("Nhập chủ đề hoặc chọn lĩnh vực rồi bấm **Tìm**. "
                "arXiv yêu cầu giãn cách 3 giây giữa các request nên mỗi lần tìm/tải sẽ hơi chậm một chút.")
        return
    results: list[Paper] = state["results"]
    if not results:
        st.warning("Không có kết quả.")
        return

    # -- where to save
    st.divider()
    folders = LIB.subfolders()
    c1, c2 = st.columns(2, vertical_alignment="bottom")
    folder_choice = c1.selectbox("Lưu vào thư mục", ["__auto__", "__root__"] + folders,
                                 format_func=lambda f: {"__auto__": "Gợi ý theo category",
                                                        "__root__": "(thư mục gốc)"}.get(f, f))
    folder_new = c2.text_input("…hoặc thư mục mới", key="folder_new", placeholder="vd AI/NLP")

    def target_folder(p: Paper) -> str:
        if folder_new.strip():
            return clean_folder(folder_new)
        if folder_choice == "__auto__":
            return config.folder_for_category(CFG, p.categories) or ""
        return "" if folder_choice == "__root__" else folder_choice

    st.subheader(f"{len(results)} kết quả")
    in_db = DB.keys()
    for i, p in enumerate(results):
        key = f"{p.source}:{p.id}"
        have = key in in_db
        with st.container(border=True):
            c1, c2 = st.columns([6, 1])
            c1.markdown(f"**{i}. {p.title}**" + ("  ✅" if have or LIB.has(p) else ""))
            cats = " ".join(f"`{c}`" for c in p.categories[:4])
            upd = f" (cập nhật {p.updated})" if p.updated and p.updated != p.published else ""
            c1.caption(f"{p.short_authors(5)}  \n📅 {p.published}{upd}  ·  "
                       f"[{p.id}{p.version}](https://arxiv.org/abs/{p.id}{p.version})  ·  {cats}")
            with c1.expander("Abstract"):
                st.write(p.summary or "(không có abstract)")
            if have:
                if c2.button("📖 Đọc", key=f"read:{key}", width="stretch"):
                    open_reader(key)
            elif LIB.has(p):
                c2.caption("Đã có file (tải bằng CLI). Bấm **Làm mới** ở sidebar.")
            elif c2.button("⬇️ Tải", key=f"dl:{key}", width="stretch", type="primary"):
                folder = target_folder(p)
                try:
                    with st.spinner(f"Đang tải {p.id}…"):
                        path = download(p, folder)
                    st.toast(f"Đã lưu {path.relative_to(ROOT)}", icon="✅")
                    st.rerun()
                except (*NET_ERRORS, OSError, ValueError) as e:
                    st.error(f"Lỗi tải {p.id}: {e}")

    if not state["exhausted"] and st.button("Tải thêm kết quả", icon="➕"):
        try:
            with st.spinner("Đang hỏi arXiv…"):
                seen = {p.id for p in results}
                more = [p for p in run_search(state["params"], len(results)) if p.id not in seen]
        except NET_ERRORS as e:
            st.error(f"Lỗi khi gọi arXiv API: {e}")
        else:
            if more:
                results += more
            else:
                state["exhausted"] = True
                st.toast("Hết kết quả.")
            st.rerun()


# ---------------------------------------------------------------- library page
def matches(p: dict, text: str) -> bool:
    hay = " ".join([p["title"], " ".join(p["authors"]), p["summary"], p["notes"],
                    " ".join(p["tags"]), p["id"]]).lower()
    return all(w in hay for w in text.lower().split())


def page_library() -> None:
    st.title("📚 Thư viện")
    added = DB.sync_from_index()
    if added:
        st.toast(f"Đã nhập {added} bài từ index.csv")
    papers = DB.all()
    if not papers:
        st.info("Thư viện trống. Sang trang **Tìm kiếm** để tải bài đầu tiên.")
        return

    counts = {s: sum(p["status"] == s for p in papers) for s in STATUSES}
    cols = st.columns(4)
    cols[0].metric("Tổng số bài", len(papers))
    for col, (s, label) in zip(cols[1:], STATUSES.items()):
        col.metric(f"{STATUS_ICONS[s]} {label}", counts[s])

    missing = DB.missing_summaries()
    if missing and st.button(f"Lấy abstract còn thiếu cho {len(missing)} bài từ arXiv",
                             icon="📝", help="Bài tải bằng CLI chưa có abstract trong thư viện"):
        try:
            with st.spinner("Đang hỏi arXiv…"):
                for paper in arxiv.fetch_by_ids(missing):
                    DB.update(f"arxiv:{paper.id}", summary=paper.summary)
            st.rerun()
        except NET_ERRORS as e:
            st.error(f"Lỗi khi gọi arXiv API: {e}")

    # -- filters
    c1, c2, c3, c4 = st.columns([3, 2, 2, 2])
    text = c1.text_input("Tìm trong thư viện", placeholder="tiêu đề, tác giả, abstract, ghi chú, tag…")
    statuses = c2.multiselect("Trạng thái", list(STATUSES), format_func=STATUSES.get)
    folder_of = lambda p: p["file"].rpartition("/")[0]
    folders = sorted({folder_of(p) for p in papers})
    folder = c3.selectbox("Thư mục", ["*"] + folders,
                          format_func=lambda f: {"*": "Tất cả", "": "(thư mục gốc)"}.get(f, f))
    tags = c4.multiselect("Tag", DB.all_tags())
    c1, c2, _ = st.columns([2, 1, 3])
    order = c1.selectbox("Sắp xếp", ["downloaded", "opened", "published", "title"],
                         format_func={"downloaded": "Mới tải nhất", "opened": "Mới mở gần đây",
                                      "published": "Ngày đăng (mới trước)", "title": "Tiêu đề A-Z"}.get)
    starred = c2.toggle("Chỉ bài ⭐")

    shown = [p for p in papers
             if (not text or matches(p, text))
             and (not statuses or p["status"] in statuses)
             and (folder == "*" or folder_of(p) == folder)
             and all(t in p["tags"] for t in tags)
             and (not starred or p["starred"])]
    sort_key = {"downloaded": lambda p: p["downloaded_at"], "opened": lambda p: p["last_opened"],
                "published": lambda p: p["published"], "title": lambda p: p["title"].lower()}[order]
    shown.sort(key=sort_key, reverse=order != "title")

    st.caption(f"Hiển thị {len(shown)}/{len(papers)} bài. Chọn một dòng để xem chi tiết.")
    table = [{
        "⭐": "⭐" if p["starred"] else "",
        "Trạng thái": f"{STATUS_ICONS[p['status']]} {STATUSES[p['status']]}",
        "Tiêu đề": p["title"],
        "Tác giả": ", ".join(p["authors"][:3]) + (" et al." if len(p["authors"]) > 3 else ""),
        "Ngày đăng": p["published"],
        "Category": p["categories"][0] if p["categories"] else "",
        "Tags": ", ".join(p["tags"]),
        "Thư mục": folder_of(p) or "/",
    } for p in shown]
    event = st.dataframe(table, hide_index=True, on_select="rerun", selection_mode="single-row",
                         key="library_table",
                         column_config={"⭐": st.column_config.TextColumn(width=40),
                                        "Tiêu đề": st.column_config.TextColumn(width="large")})
    rows = event.selection.rows
    if not rows or rows[0] >= len(shown):
        return

    p = shown[rows[0]]
    st.divider()
    c1, c2 = st.columns([3, 2], gap="large")
    with c1:
        st.subheader(p["title"])
        paper_meta(p)
        if st.button("📖 Đọc bài này", type="primary"):
            open_reader(p["key"])
        st.markdown("**Abstract**")
        st.write(p["summary"] or "_(chưa có — bấm nút “Lấy abstract còn thiếu” ở trên)_")
    with c2:
        paper_editor(p, "lib")


# ---------------------------------------------------------------- reader page
def page_read() -> None:
    papers = DB.all()
    if not papers:
        st.title("📖 Đọc")
        st.info("Thư viện trống. Sang trang **Tìm kiếm** để tải bài.")
        return
    papers.sort(key=lambda p: p["last_opened"], reverse=True)
    keys = [p["key"] for p in papers]
    by_key = {p["key"]: p for p in papers}
    current = st.session_state.get("reading")
    if current not in by_key:
        current = keys[0]

    c1, c2, c3 = st.columns([5, 1, 1], vertical_alignment="bottom")
    key = c1.selectbox("Bài đang đọc", keys, index=keys.index(current),
                       format_func=lambda k: f"{STATUS_ICONS[by_key[k]['status']]} {by_key[k]['title']}")
    height = c2.number_input("Chiều cao khung", 400, 3000, 900, step=100)
    side = c3.toggle("Panel ghi chú", value=True)
    st.session_state.reading = key

    if st.session_state.get("opened") != key:
        DB.mark_opened(key)
        st.session_state.opened = key
        st.rerun()  # refresh the status icons in the picker
    p = DB.get(key)
    pdf = DB.pdf_path(p)

    def show_pdf():
        if not pdf.exists():
            st.error(f"Không tìm thấy file: {pdf}")
        else:
            # st.pdf renders with PDF.js. (Chrome blocks its built-in viewer inside
            # Streamlit's sandboxed iframes, so st.iframe shows "blocked".)
            try:
                st.pdf(pdf, height=int(height), key=f"pdf:{key}")
            except Exception as e:  # streamlit-pdf not installed
                st.error(f"Không mở được PDF ({e}). Chạy: pip install -U -r requirements.txt")

    if side:
        c1, c2 = st.columns([2, 1], gap="medium")
        with c1:
            show_pdf()
        with c2:
            st.markdown(f"**{p['title']}**")
            paper_meta(p)
            with st.expander("Abstract"):
                st.write(p["summary"] or "(chưa có)")
            paper_editor(p, "read")
    else:
        show_pdf()


# ---------------------------------------------------------------- navigation
PAGES = {
    "search": st.Page(page_search, title="Tìm kiếm", icon="🔎", default=True),
    "library": st.Page(page_library, title="Thư viện", icon="📚", url_path="library"),
    "read": st.Page(page_read, title="Đọc", icon="📖", url_path="read"),
}
nav = st.navigation(list(PAGES.values()))
with st.sidebar:
    st.caption(f"Thư viện: `{ROOT}`")
    if st.button("🔄 Làm mới", help="Đọc lại config.json và các bài tải bằng CLI"):
        load_app.clear()
        st.rerun()
nav.run()
