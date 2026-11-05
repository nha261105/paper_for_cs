# make            -> install what is missing, then run backend (:8000) + frontend (:5173)
#                    open http://localhost:5173
# make serve      -> build the frontend once, serve everything from the backend on :8000
# make install    -> only install (Python .venv in backend/, node_modules in frontend/)
# make cli ARGS='-p rag'   -> the terminal tool (backend/fetcher.py)
# make clean      -> delete .venv, node_modules and the frontend build
#
# Ctrl+C stops both servers. make cannot activate the venv in your own shell,
# so commands call backend/.venv's python directly (same effect).

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

.PHONY: dev run-backend run-frontend serve build install cli clean
.DEFAULT_GOAL := dev

dev: install
	@echo ""
	@echo "  App:  http://localhost:5173   (API: http://localhost:$(API_PORT)/docs)"
	@echo "  Ctrl+C to stop."
	@echo ""
	@$(MAKE) --no-print-directory -j2 run-backend run-frontend

run-backend:
	cd $(BACKEND) && $(abspath $(VENV_PY)) -m uvicorn server:app --reload --port $(API_PORT)

run-frontend:
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
