"""Optional C++ extension loader."""

from __future__ import annotations

import os
from pathlib import Path

if os.name == "nt":  # pragma: no cover - Windows runtime environment detail.
    mingw_bin = Path("C:/msys64/mingw64/bin")
    if mingw_bin.exists():
        os.add_dll_directory(str(mingw_bin))

try:  # pragma: no cover - depends on local native build.
    from . import _options_core as core
except ImportError:  # pragma: no cover
    try:
        import _options_core as core  # type: ignore[no-redef]
    except ImportError:
        core = None  # type: ignore[assignment]

CORE_AVAILABLE = core is not None

__all__ = ["CORE_AVAILABLE", "core"]
