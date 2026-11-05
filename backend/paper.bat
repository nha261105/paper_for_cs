@echo off
rem Double-click to search arXiv step by step, or run "paper <args>" from a terminal.
chcp 65001 >nul
python "%~dp0fetcher.py" %*
if "%~1"=="" pause
