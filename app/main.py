"""Embelify — local image pipeline: upscale → background removal → SVG."""

from __future__ import annotations

import io
import logging
from enum import Enum
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image

from app.services.background import remove_background
from app.services.svg import raster_to_svg
from app.services.upscale import upscale_image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("embelify")

app = FastAPI(title="Embelify", version="1.0.0")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
ALLOWED_TYPES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/bmp",
}


class UpscaleFactor(str, Enum):
    none = "1"
    x2 = "2"
    x4 = "4"


def _load_image(data: bytes) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Image illisible ou corrompue.") from exc
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    return img


def _to_png_bytes(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


@app.get("/", response_class=HTMLResponse)
async def index() -> HTMLResponse:
    with open("app/static/index.html", encoding="utf-8") as f:
        return HTMLResponse(f.read())


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "app": "Embelify"}


@app.post("/api/process")
async def process_image(
    file: UploadFile = File(...),
    upscale: UpscaleFactor = Form(UpscaleFactor.none),
    remove_bg: bool = Form(False),
    to_svg: bool = Form(False),
) -> Response:
    if not file.content_type or file.content_type.lower() not in ALLOWED_TYPES:
        # Some browsers send empty/octet-stream — sniff from filename
        name = (file.filename or "").lower()
        if not any(name.endswith(ext) for ext in (".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp")):
            raise HTTPException(
                status_code=400,
                detail="Format non supporté. Utilisez PNG, JPEG, WebP, GIF ou BMP.",
            )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Fichier vide.")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 25 Mo).")

    if not any((upscale != UpscaleFactor.none, remove_bg, to_svg)):
        raise HTTPException(
            status_code=400,
            detail="Activez au moins une étape : upscale, fond transparent ou SVG.",
        )

    img = _load_image(data)
    factor = int(upscale.value)
    logger.info(
        "Process start: %s size=%sx%s upscale=%s rembg=%s svg=%s",
        file.filename,
        img.width,
        img.height,
        factor,
        remove_bg,
        to_svg,
    )

    try:
        # Best order: upscale → remove background → SVG
        if factor > 1:
            img = upscale_image(img, factor)

        if remove_bg:
            img = remove_background(img)

        if to_svg:
            svg_text = raster_to_svg(img)
            return Response(
                content=svg_text.encode("utf-8"),
                media_type="image/svg+xml",
                headers={
                    "Content-Disposition": 'attachment; filename="embelify.svg"',
                    "X-Embelify-Pipeline": f"upscale={factor};rembg={int(remove_bg)};svg=1",
                },
            )

        png = _to_png_bytes(img if img.mode == "RGBA" else img.convert("RGBA"))
        return Response(
            content=png,
            media_type="image/png",
            headers={
                "Content-Disposition": 'attachment; filename="embelify.png"',
                "X-Embelify-Pipeline": f"upscale={factor};rembg={int(remove_bg)};svg=0",
            },
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception("Processing failed")
        raise HTTPException(
            status_code=500,
            detail=f"Échec du traitement : {exc}",
        ) from exc
