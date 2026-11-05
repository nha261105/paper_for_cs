# Run from the repo root (the folder that holds backend/ and frontend/):
#
# make            -> install what is missing, then start the backend (:8000),
#                    wait until its API answers, then start the frontend (:5173).
#                    Open http://localhost:5173. Ctrl+C stops both.
# make backend    -> only the backend   (to run the two in separate terminals)
# make frontend   -> only the frontend
# make serve      -> build the frontend once, serve everything from the backend on :8000
# make install    -> only install (Python .venv in backend/, node_modules in frontend/)
# make cli ARGS='-p rag'   -> the terminal tool (backend/fetcher.py)
# make clean      -> delete .venv, node_modules and the frontend build
#
# make cannot activate the venv in your own shell, so commands call
# backend/.venv's python directly (same effect).

BACKEND  := backend
FRONTEND := frontend
VENV     := $(BACKEND)/.venv
API_PORT ?= 8000

ifeq ($(OS),Windows_NT)
    PYTHON ?= python
    VENV_PY := $(VENV)/Scripts/python.exe
else
    PYTHON ?= python3
    VENV_PY := $(VENV)/bin/python
endif

PY_STAMP   := $(VENV)/.installed
NODE_STAMP := $(FRONTEND)/node_modules/.installed

.PHONY: dev backend frontend serve build install cli clean
.DEFAULT_GOAL := dev

# 1) backend in the background  2) wait for /api/meta  3) frontend in the foreground.
# When the frontend stops (Ctrl+C or crash) the backend is stopped too.
dev: install
	@echo "[1/2] Backend  -> http://localhost:$(API_PORT)  (API docs: /docs)"
	@(cd $(BACKEND) && exec $(abspath $(VENV_PY)) -m uvicorn server:app --reload --port $(API_PORT)) & \
	BACK=$$!; \
	trap 'kill $$BACK 2>/dev/null' EXIT INT TERM; \
	printf "      waiting for the backend"; \
	for i in $$(seq 1 60); do \
		if ! kill -0 $$BACK 2>/dev/null; then echo; echo "Backend failed to start (see the error above)."; exit 1; fi; \
		if $(VENV_PY) -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:$(API_PORT)/api/meta', timeout=1)" 2>/dev/null; then break; fi; \
		printf "."; sleep 0.5; \
	done; \
	echo " ready"; \
	echo "[2/2] Frontend -> http://localhost:5173   (Ctrl+C stops both)"; \
	cd $(FRONTEND) && npm run dev

backend: $(PY_STAMP)
	cd $(BACKEND) && $(abspath $(VENV_PY)) -m uvicorn server:app --reload --port $(API_PORT)

frontend: $(NODE_STAMP)
	cd $(FRONTEND) && npm run dev

build: $(NODE_STAMP)
	cd $(FRONTEND) && npm run build

serve: install build
	@echo "  App: http://localhost:$(API_PORT)"
	cd $(BACKEND) && $(abspath $(VENV_PY)) -m uvicorn server:app --port $(API_PORT)

install: $(PY_STAMP) $(NODE_STAMP)

# Re-run automatically when requirements.txt / package.json change.
$(PY_STAMP): $(BACKEND)/requirements.txt | $(VENV_PY)
	$(VENV_PY) -m pip install --upgrade pip
	$(VENV_PY) -m pip install -U -r $(BACKEND)/requirements.txt
	$(VENV_PY) -c "open('$(PY_STAMP)', 'w').close()"

$(VENV_PY):
	$(PYTHON) -m venv $(VENV)

$(NODE_STAMP): $(FRONTEND)/package.json
	cd $(FRONTEND) && npm install --no-fund --no-audit
	$(PYTHON) -c "open('$(NODE_STAMP)', 'w').close()"

cli: $(VENV_PY)
	cd $(BACKEND) && $(abspath $(VENV_PY)) fetcher.py $(ARGS)

clean:
	$(PYTHON) -c "import shutil; [shutil.rmtree(p, ignore_errors=True) for p in ('$(VENV)', '$(FRONTEND)/node_modules', '$(FRONTEND)/dist')]"
