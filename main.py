"""Совместимость со старым способом запуска: `uvicorn main:app` или `python main.py`."""

import sys
from pathlib import Path

_SRC_DIR = str(Path(__file__).resolve().parent / "src")
if _SRC_DIR not in sys.path:
    sys.path.insert(0, _SRC_DIR)

from text_quest import main  # noqa: E402
from text_quest.app import app  # noqa: E402

__all__ = ["app"]

if __name__ == "__main__":
    main()
