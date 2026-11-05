# make          -> create .venv if needed, install requirements, open the web app
# make install  -> only create .venv / install requirements
# make cli      -> run the terminal tool (fetcher.py) inside .venv
# make clean    -> delete .venv
#
# make cannot activate a venv in your own shell, so every command runs the
# .venv's python directly (same effect as activating it first).

VENV := .venv
PORT ?= 8501

ifeq ($(OS),Windows_NT)
    PYTHON ?= python
    VENV_PY := $(VENV)/Scripts/python.exe
else
    PYTHON ?= python3
    VENV_PY := $(VENV)/bin/python
endif

STAMP := $(VENV)/.installed

.PHONY: run install cli clean
.DEFAULT_GOAL := run

run: $(STAMP)
	$(VENV_PY) -m streamlit run app.py --server.port $(PORT)

install: $(STAMP)

# Reinstalls automatically whenever requirements.txt changes.
$(STAMP): requirements.txt | $(VENV_PY)
	$(VENV_PY) -m pip install --upgrade pip
	$(VENV_PY) -m pip install -U -r requirements.txt
	$(VENV_PY) -c "open('$(STAMP)', 'w').close()"

$(VENV_PY):
	$(PYTHON) -m venv $(VENV)

cli: $(VENV_PY)
	$(VENV_PY) fetcher.py $(ARGS)

clean:
	$(PYTHON) -c "import shutil; shutil.rmtree('$(VENV)', ignore_errors=True)"
