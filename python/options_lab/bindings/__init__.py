"""Optional C++ extension loader."""

from __future__ import annotations

try:  # pragma: no cover - depends on local native build.
    from . import _options_core as core
except ImportError:  # pragma: no cover
    try:
        import _options_core as core  # type: ignore[no-redef]
    except ImportError:
        core = None  # type: ignore[assignment]

CORE_AVAILABLE = core is not None

__all__ = ["CORE_AVAILABLE", "core"]

