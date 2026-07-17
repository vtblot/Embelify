"""High-quality image upscaling via OpenCV DNN Super-Resolution (FSRCNN), with LANCZOS fallback."""

from __future__ import annotations

import logging
import urllib.request
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

logger = logging.getLogger("embelify.upscale")

MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
FSRCNN_URLS = {
    2: "https://github.com/Saafke/FSRCNN_Tensorflow/raw/master/models/FSRCNN_x2.pb",
    3: "https://github.com/Saafke/FSRCNN_Tensorflow/raw/master/models/FSRCNN_x3.pb",
    4: "https://github.com/Saafke/FSRCNN_Tensorflow/raw/master/models/FSRCNN_x4.pb",
}

_sr_cache: dict[int, cv2.dnn_superres.DnnSuperResImpl] = {}


def _ensure_model(factor: int) -> Path:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    path = MODELS_DIR / f"FSRCNN_x{factor}.pb"
    if path.exists() and path.stat().st_size > 1000:
        return path
    url = FSRCNN_URLS[factor]
    logger.info("Downloading FSRCNN x%d model…", factor)
    urllib.request.urlretrieve(url, path)
    return path


def _get_sr(factor: int):
    if factor not in _sr_cache:
        model_path = _ensure_model(factor)
        sr = cv2.dnn_superres.DnnSuperResImpl_create()
        sr.readModel(str(model_path))
        sr.setModel("fsrcnn", factor)
        _sr_cache[factor] = sr
    return _sr_cache[factor]


def _lanczos_upscale(img: Image.Image, factor: int) -> Image.Image:
    w, h = img.size
    return img.resize((w * factor, h * factor), Image.Resampling.LANCZOS)


def _pil_to_bgr(img: Image.Image) -> tuple[np.ndarray, np.ndarray | None]:
    """Return BGR image and optional alpha channel."""
    if img.mode == "RGBA":
        rgba = np.array(img)
        alpha = rgba[:, :, 3]
        rgb = rgba[:, :, :3]
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        return bgr, alpha
    rgb = np.array(img.convert("RGB"))
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR), None


def _bgr_to_pil(bgr: np.ndarray, alpha: np.ndarray | None) -> Image.Image:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    if alpha is not None:
        # Resize alpha to match if needed
        if alpha.shape[:2] != rgb.shape[:2]:
            alpha = cv2.resize(
                alpha,
                (rgb.shape[1], rgb.shape[0]),
                interpolation=cv2.INTER_LANCZOS4,
            )
        rgba = np.dstack([rgb, alpha])
        return Image.fromarray(rgba, mode="RGBA")
    return Image.fromarray(rgb, mode="RGB")


def upscale_image(img: Image.Image, factor: int) -> Image.Image:
    """Upscale by 2 or 4. Preserves alpha by upscaling it separately with LANCZOS."""
    if factor not in (2, 3, 4):
        raise ValueError(f"Facteur d'upscale non supporté : {factor}")

    # Cap extremely large outputs to avoid OOM (max ~16 MP after upscale)
    max_pixels = 16_000_000
    out_w, out_h = img.width * factor, img.height * factor
    if out_w * out_h > max_pixels:
        # Fall back to a smaller effective scale via LANCZOS toward the cap
        scale = (max_pixels / (img.width * img.height)) ** 0.5
        new_size = (max(1, int(img.width * scale)), max(1, int(img.height * scale)))
        logger.warning("Image trop grande pour x%d — redimensionnement limité à %s", factor, new_size)
        return img.resize(new_size, Image.Resampling.LANCZOS)

    bgr, alpha = _pil_to_bgr(img)

    try:
        sr = _get_sr(factor)
        # FSRCNN expects BGR; process RGB channels only
        up_bgr = sr.upsample(bgr)
        result = _bgr_to_pil(up_bgr, alpha)
        logger.info("FSRCNN x%d OK → %sx%s", factor, result.width, result.height)
        return result
    except Exception as exc:  # noqa: BLE001
        logger.warning("FSRCNN indisponible (%s) — fallback LANCZOS", exc)
        return _lanczos_upscale(img, factor)
