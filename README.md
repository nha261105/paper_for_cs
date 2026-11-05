# paper_for_cs

App nhỏ chạy trên máy mình để tìm paper AI / CS trên arXiv, tải PDF về, quản lý thư viện và đọc + ghi chú
ngay trên trình duyệt. Dùng API chính thức của arXiv (không cào HTML), giãn cách ≥ 3 giây giữa các request.

```
backend/    Python: FastAPI (server.py) + CLI cũ (fetcher.py) + thư viện paperfetch
frontend/   React + Vite + TypeScript
papers/     PDF đã tải + index.csv + library.db (tự tạo, không commit)
```

## Chạy app

Cần Python 3.10+ và Node.js 18+. macOS / Linux dùng `make`; Windows dùng `dev.bat` (xem bên dưới).

```bash
make
```

Chạy ở thư mục gốc của repo (thư mục chứa `backend/` và `frontend/`), rồi mở **http://localhost:5173**.

`make` làm tuần tự:

1. Lần đầu: tạo `backend/.venv`, cài thư viện Python, `npm install` cho frontend
   (các lần sau bỏ qua, chỉ cài lại khi `requirements.txt` / `package.json` đổi).
2. Bật backend ở `:8000` (tài liệu API: http://localhost:8000/docs) và chờ đến khi API trả lời được.
   Nếu backend lỗi (vd cổng 8000 đang bận), `make` dừng và in lỗi, không bật frontend.
3. Bật frontend ở `:5173`.

Sửa code là tự reload. `Ctrl+C` tắt cả hai.

| Lệnh | Làm gì |
|---|---|
| `make` | Chạy backend rồi frontend để dùng / phát triển |
| `make backend` / `make frontend` | Chỉ chạy một phần (khi muốn mở 2 terminal riêng) |
| `make serve` | Build frontend một lần rồi chỉ chạy backend: mở http://localhost:8000 (nhẹ hơn, không cần Vite) |
| `make install` | Chỉ cài đặt |
| `make cli ARGS='-p rag'` | Chạy CLI trong `.venv` |
| `make clean` | Xoá `.venv`, `node_modules`, bản build |

**Windows** (không có `make`): chạy file `dev.bat` (double-click, hoặc gõ trong PowerShell / cmd ở thư mục gốc).
Nó làm y hệt `make`: tạo `.venv`, cài thư viện, bật backend, chờ API, rồi bật frontend.

```powershell
.\dev.bat
```

Các lệnh khác giống bảng ở trên, thay `make` bằng `.\dev.bat`: `.\dev.bat backend`, `.\dev.bat frontend`, `.\dev.bat serve`,
`.\dev.bat cli -p rag`, `.\dev.bat clean`. (Có thể gọi thẳng `.\dev.ps1 ...` nếu máy cho phép chạy script PowerShell.)

Hoặc chạy tay trong 2 terminal:

```bash
cd backend && python -m venv .venv && .venv/Scripts/pip install -r requirements.txt && .venv/Scripts/python -m uvicorn server:app --reload
```

```bash
cd frontend && npm install && npm run dev
```

(macOS/Linux: thay `.venv/Scripts/` bằng `.venv/bin/`.)

## Các trang

- **Tìm kiếm**: một thanh tìm kiếm, bộ lọc dạng nút (Lĩnh vực, Tìm trong, Thời gian, Sắp xếp, Số bài, Lưu vào).
  Đổi bộ lọc khi đang có kết quả là tìm lại ngay. Mỗi kết quả có abstract (bấm để mở rộng) và nút **Tải về**;
  tải xong có thông báo kèm nút **Đọc**. Preset trong `config.json` nằm ở nút **Preset**.
- **Thư viện**: thanh bên lọc theo trạng thái, bài hay, thư mục, tag (kèm số bài); ô lọc nhanh; bấm một bài để mở
  panel chi tiết (abstract, trạng thái, tag, ghi chú), nhấp đúp để đọc.
- **Đọc**: PDF mở bằng trình xem PDF của trình duyệt (zoom, tìm chữ, copy, in), panel ghi chú bên phải kéo giãn được.
  Ghi chú Markdown tự lưu. Mở bài lần đầu tự chuyển sang "Đang đọc".

Giao diện sáng / tối / theo hệ thống: nút ở góc dưới thanh bên.

| Phím | Ở đâu | Làm gì |
|---|---|---|
| `Ctrl+K` (macOS `⌘K`) | mọi nơi | Tìm nhanh: mở bài bất kỳ, chuyển trang, đổi giao diện |
| `/` | Tìm kiếm, Thư viện | Nhảy vào ô tìm |
| `j` / `k` (hoặc ↓ / ↑) | Thư viện | Chọn bài |
| `Enter` / `o` / `s` | Thư viện | Mở chi tiết / đọc / đánh dấu bài hay |
| `n` | Đọc | Ẩn / hiện panel ghi chú |

Trạng thái, tag, ghi chú lưu trong `papers/library.db` (SQLite). Bài tải bằng CLI tự xuất hiện trong thư viện;
bấm **Làm mới** ở thanh bên nếu app đang mở. Bài tải bằng CLI chưa có abstract: bấm **Lấy abstract còn thiếu**.

## CLI (terminal)

Chạy trong thư mục `backend/` (hoặc dùng `make cli ARGS='...'` ở thư mục gốc).

### Cách đơn giản nhất: chọn theo menu

- **Windows:** double-click `paper.bat`.
- **Hoặc trong terminal:** chạy `python fetcher.py` không kèm gì.

Tool hỏi lần lượt: preset (nếu có), chủ đề, tìm ở đâu, lĩnh vực, cách sắp xếp, khoảng thời gian, số kết quả.
Mỗi bước chỉ cần gõ số hoặc Enter để lấy mặc định. Cuối cùng tool in ra lệnh tương đương để lần sau chạy nhanh.

### Chạy thẳng bằng lệnh

Chạy trong terminal (PowerShell, cmd, Terminal trên macOS/Linux) tại thư mục project:

```bash
python fetcher.py "retrieval augmented generation"
```

### Sau khi có kết quả

1. Tool in danh sách kết quả: số thứ tự, ngày đăng, arXiv ID, category chính, tiêu đề, vài tác giả đầu. Bài đã tải được đánh dấu `[đã tải]`.
2. Tại dấu nhắc, gõ:
   - `0 3 5`, `2-6`, `0,2-4` hoặc `all`: chọn bài để tải
   - `a 3` (hoặc `a 0-2`): xem abstract trước khi quyết định
   - `m`: tải thêm trang kết quả tiếp theo
   - Enter: thoát
3. Chọn thư mục lưu: số trong danh sách, tên mới (vd `AI/NLP`), `.` = thư mục gốc,
   hoặc Enter để nhận thư mục gợi ý theo category (xem `category_folders`).
4. PDF được lưu với tên `<arXivID><version>_<Tiêu_đề>.pdf`, vd `1706.03762v7_Attention_Is_All_You_Need.pdf`.

Bài đã có (theo `index.csv` hoặc file PDF nằm ở bất kỳ thư mục con nào) sẽ không bị tải lại.
Metadata mỗi bài đã tải được ghi vào `<download_dir>/index.csv` (mở được bằng Excel).

### Tham số

```
query                 chủ đề (có thể bỏ trống nếu dùng -c hoặc -p)
-p, --preset NAME     dùng preset trong config.json; --presets để liệt kê
-c, --category CAT    lọc category, lặp lại được (-c cs.CL -c cs.LG)
-n, --max-results N   số kết quả mỗi trang
-s, --sort            relevance | date (mới nộp nhất) | updated (mới cập nhật nhất) | oldest
-i, --in FIELD        all | title | abstract | author
--since YYYY-MM-DD    nộp từ ngày
--until YYYY-MM-DD    nộp đến ngày
--last 30d            trong khoảng gần đây: d = ngày, w = tuần, m = tháng, y = năm
-o, --output DIR      thư mục gốc lưu PDF
-f, --folder NAME     thư mục con (bỏ qua bước hỏi), vd AI/NLP
--config FILE         dùng file config khác
```

Lưu ý về sort: `relevance` do arXiv tính theo mức khớp từ khoá, không theo số trích dẫn.

### Ví dụ

```bash
# 20 bài mới nhất về RAG trong cs.CL hoặc cs.IR, nộp trong 3 tháng gần đây
python fetcher.py "retrieval augmented generation" -c cs.CL -c cs.IR -n 20 -s date --last 3m

# Chỉ tìm trong tiêu đề, năm 2017, cũ nhất trước
python fetcher.py "attention is all you need" -i title --since 2017-01-01 --until 2017-12-31 -s oldest

# Bài của một tác giả
python fetcher.py "Hinton" -i author -s date

# Bài mới nhất của một category, không cần từ khoá
python fetcher.py -c cs.CV -s date --last 7d

# Cú pháp nâng cao của arXiv
python fetcher.py 'ti:"diffusion model" AND au:Ho'

# Dùng preset (định nghĩa trong config.json), ghi đè số kết quả
python fetcher.py -p rag -n 5
```

Truy vấn thường được tách thành từng từ và nối bằng `AND` trong trường đã chọn (bỏ qua các từ như
"is", "the", "of"... vì arXiv không đánh chỉ mục chúng). Nếu truy vấn đã chứa tiền tố trường của arXiv
(`ti:`, `au:`, `abs:`, `cat:`, `all:`...) thì được gửi nguyên văn.

## Cấu hình (`backend/config.json`, tuỳ chọn)

Tạo từ file mẫu: `cp backend/config.example.json backend/config.json` (Windows: `copy`). Sửa xong bấm **Làm mới** trong app.

Thứ tự ưu tiên: mặc định < `config.json` < preset < tham số dòng lệnh.

| Khoá | Ý nghĩa | Mặc định |
|---|---|---|
| `download_dir` | Thư mục gốc lưu PDF. Đường dẫn tương đối tính từ thư mục chứa `config.json`; dùng được `~`. | `../papers` (= `<repo>/papers`) |
| `folders` | Các thư mục con được tạo sẵn trong `download_dir` | `["CS", "AI"]` |
| `max_results` | Số kết quả mỗi trang | `10` |
| `sort` | `relevance`, `date`, `updated` hoặc `oldest` | `relevance` |
| `field` | `all`, `title`, `abstract` hoặc `author` | `all` |
| `categories` | Category lọc mặc định, vd `["cs.CL", "cs.LG"]` | `[]` |
| `category_folders` | Category → thư mục gợi ý khi lưu. Khớp chính xác trước (`cs.CV`), rồi theo nhóm (`cs`). | `{}` |
| `presets` | Các bộ tìm kiếm đặt tên, xem bên dưới | `{}` |

Mỗi preset có thể chứa: `query`, `categories`, `max_results`, `sort`, `field`, `since`, `until`, `last`, `folder`.

```json
"presets": {
  "rag":    { "query": "retrieval augmented generation", "categories": ["cs.CL", "cs.IR"],
              "sort": "date", "last": "30d", "folder": "AI/NLP" },
  "new-cv": { "categories": ["cs.CV"], "sort": "date", "last": "7d", "max_results": 20 }
}
```

Xem `config.example.json` để có ví dụ đầy đủ.

## Cấu trúc

```
Makefile                   make = cài đặt, chạy backend rồi frontend (macOS / Linux)
dev.ps1, dev.bat           như make, cho Windows
backend/
  server.py                FastAPI: /api/search, /api/library, /api/paper, PDF; phục vụ frontend/dist nếu có
  fetcher.py               CLI: tham số, in kết quả, chọn bài, chọn thư mục
  paperfetch/
    db.py                  SQLite: trạng thái đọc, tag, ghi chú
    models.py              dataclass Paper dùng chung cho mọi nguồn
    net.py                 HTTP GET + giãn cách + retry (an toàn khi gọi song song)
    config.py              đọc config.json, preset, gợi ý thư mục theo category
    storage.py             đặt tên file, tên thư mục an toàn, kiểm tra trùng, ghi index.csv
    sources/arxiv.py       gọi arXiv API và parse Atom feed
frontend/src/               React + Tailwind CSS v4 + component kiểu shadcn/ui (Radix, cmdk, sonner)
  api.ts                   gọi backend
  store.tsx                state dùng chung (thư viện, form + kết quả tìm kiếm)
  theme.tsx                sáng / tối / theo hệ thống
  index.css                màu và font (light + dark)
  pages/                   SearchPage, LibraryPage, ReaderPage
  components/              PaperEditor, CommandPalette, Status, TagInput, ...
  components/ui/           Button, Input, Popover, DropdownMenu, Dialog/Sheet, Command, Tooltip
```

Muốn thêm nguồn khác (Semantic Scholar, OpenAlex): tạo `backend/paperfetch/sources/<tên>.py` với
`search(...) -> list[Paper]` và `download_pdf(paper) -> bytes`.
