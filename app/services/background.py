"""Background removal via rembg (u2net)."""

from __future__ import annotations

import io
import logging

from PIL import Image
from rembg import new_session, remove

logger = logging.getLogger("embelify.background")

_session = None


def _get_session():
    global _session
    if _session is None:
        # u2net: good general quality; downloaded on first use
        logger.info("Loading rembg session (u2net)…")
        _session = new_session("u2net")
    return _session


def remove_background(img: Image.Image) -> Image.Image:
    """Return RGBA image with transparent background."""
    session = _get_session()
    # rembg works best with RGB/RGBA PIL images
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    out_bytes = remove(buf.getvalue(), session=session)
    out = Image.open(io.BytesIO(out_bytes))
    out.load()
    if out.mode != "RGBA":
        out = out.convert("RGBA")
    logger.info("Background removed → %sx%s", out.width, out.height)
    return out
