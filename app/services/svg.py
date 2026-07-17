"""Raster → SVG vectorization via vtracer."""

from __future__ import annotations

import logging
import tempfile
from pathlib import Path

import vtracer
from PIL import Image

logger = logging.getLogger("embelify.svg")


def raster_to_svg(img: Image.Image) -> str:
    """
    Convert a PIL image to SVG markup.
    Works best on logos / flat graphics / cut-out subjects — not photos.
    """
    if img.mode != "RGBA":
        img = img.convert("RGBA")

    with tempfile.TemporaryDirectory(prefix="embelify-") as tmp:
        tmp_path = Path(tmp)
        png_path = tmp_path / "input.png"
        svg_path = tmp_path / "output.svg"
        img.save(png_path, format="PNG")

        # Hierarchical mode preserves shapes well for cut-outs
        vtracer.convert_image_to_svg_py(
            str(png_path),
            str(svg_path),
            colormode="color",
            hierarchical="stacked",
            mode="spline",
            filter_speckle=4,
            color_precision=6,
            layer_difference=16,
            corner_threshold=60,
            length_threshold=4.0,
            max_iterations=10,
            splice_threshold=45,
            path_precision=3,
        )

        svg_text = svg_path.read_text(encoding="utf-8")
        logger.info("SVG generated (%d chars)", len(svg_text))
        return svg_text
