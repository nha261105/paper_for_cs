"""Settings: built-in defaults < config.json < preset < command-line flags."""
import json
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = PROJECT_DIR / "config.json"

DEFAULTS = {
    "download_dir": "papers",       # relative paths are resolved against the config file's folder
    "folders": ["CS", "AI"],        # sub-folders created inside download_dir
    "max_results": 10,
    "sort": "relevance",            # relevance | date | updated | oldest
    "field": "all",                 # all | title | abstract | author
    "categories": [],               # e.g. ["cs.CL", "cs.LG"]
    "category_folders": {},         # e.g. {"cs.CV": "AI/CV", "cs": "CS"} -> suggested folder
    "presets": {},                  # name -> {query, categories, sort, ..., folder}
}
PRESET_KEYS = {"query", "categories", "max_results", "sort", "field",
               "since", "until", "last", "folder"}


def load(path: Path | None = None) -> dict:
    cfg = dict(DEFAULTS)
    path = path or DEFAULT_CONFIG_PATH
    base = path.resolve().parent
    if path.exists():
        with open(path, encoding="utf-8") as f:
            user = json.load(f)
        unknown = set(user) - set(DEFAULTS)
        if unknown:
            raise ValueError(f"{path}: unknown keys {sorted(unknown)}")
        cfg.update(user)
    elif path != DEFAULT_CONFIG_PATH:
        raise FileNotFoundError(path)
    for name, preset in cfg["presets"].items():
        unknown = set(preset) - PRESET_KEYS
        if unknown:
            raise ValueError(f"{path}: preset {name!r} has unknown keys {sorted(unknown)}")
    cfg["download_dir"] = (base / Path(cfg["download_dir"]).expanduser()).resolve()
    return cfg


def folder_for_category(cfg: dict, categories: list[str]) -> str | None:
    """First match in `category_folders`, trying each category (primary first)
    exactly, then by archive prefix ("cs.CV" -> "cs")."""
    mapping = cfg["category_folders"]
    for cat in categories:
        if cat in mapping:
            return mapping[cat]
    for cat in categories:
        prefix = cat.split(".", 1)[0]
        if prefix in mapping:
            return mapping[prefix]
    return None
