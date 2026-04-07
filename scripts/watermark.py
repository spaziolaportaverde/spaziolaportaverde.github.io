#!/usr/bin/env python3
"""
watermark.py — Dual-layer watermarking for fine art JPEG images.

Applies:
  1. A tiled semi-transparent visible watermark (text, diagonal pattern)
  2. An invisible DWT+DCT steganographic watermark (forensic proof of authorship)

Designed to run in a GitHub Actions workflow after ImageMagick resizing.

Usage:
    python watermark.py [OPTIONS] INPUT_DIR OUTPUT_DIR

Options:
    --text       TEXT     Watermark text  [default: "© Artist Name"]
    --opacity    0-255    Visible watermark opacity  [default: 45]
    --font-size  INT      Font size in px  [default: 28]
    --angle      FLOAT    Tile rotation angle in degrees  [default: -30]
    --invisible  TEXT     Payload embedded invisibly (author ID, URL, etc.)
                          If omitted, falls back to --text value.
    --no-visible          Skip visible watermark layer
    --no-invisible        Skip invisible watermark layer
    --quality    INT      Output JPEG quality 1-95  [default: 88]
    --suffix     TEXT     Filename suffix before extension  [default: "_wm"]
    --overwrite           Overwrite existing output files
    -v, --verbose         Print per-file progress

Exit codes:
    0  All files processed successfully
    1  One or more files failed (partial success is still possible)
    2  Fatal configuration error

Requirements (add to requirements.txt or workflow pip install step):
    Pillow>=10.0.0
    invisible-watermark>=0.1.5
    numpy>=1.24.0
"""

import argparse
import logging
import math
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Lazy imports — give clear errors if dependencies are missing
# ---------------------------------------------------------------------------
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Missing dependency: pip install Pillow")

try:
    import numpy as np
except ImportError:
    sys.exit("Missing dependency: pip install numpy")

_imwatermark_available = False
try:
    from imwatermark import WatermarkEncoder, WatermarkDecoder  # noqa: F401
    _imwatermark_available = True
except ImportError:
    pass  # handled at runtime if --no-invisible not passed


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    level=logging.INFO,
)
log = logging.getLogger("watermark")


# ---------------------------------------------------------------------------
# Font resolution
# ---------------------------------------------------------------------------
# Candidate system font paths tried in order.
# Georgia / Palatino feel appropriate for fine art contexts.
_FONT_CANDIDATES = [
    # Linux (GitHub Actions ubuntu runner)
    "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
    "/usr/share/fonts/truetype/freefont/FreeSerif.ttf",
    # macOS
    "/Library/Fonts/Georgia.ttf",
    "/System/Library/Fonts/Supplemental/Georgia.ttf",
    # Windows
    "C:/Windows/Fonts/georgia.ttf",
    "C:/Windows/Fonts/times.ttf",
]


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    """Return the best available serif font at the requested size."""
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    log.warning("No TrueType font found — falling back to bitmap default. "
                "Install fonts-liberation or ttf-dejavu in your workflow for better results.")
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Visible watermark layer
# ---------------------------------------------------------------------------

def apply_visible_watermark(
    img: Image.Image,
    text: str,
    opacity: int = 45,
    font_size: int = 28,
    angle: float = -30.0,
) -> Image.Image:
    """
    Tile a semi-transparent text watermark diagonally across the whole image.

    Tiling across the full canvas (rather than a single corner mark) makes
    AI inpainting attacks much harder because there is no clean reference
    region from which to reconstruct the underlying paint.

    The watermark uses a white fill with a thin dark stroke so it remains
    legible on both light and dark paintings.
    """
    img = img.convert("RGBA")
    font = _load_font(font_size)

    # --- Measure text in a scratch surface ---
    scratch = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    bbox = scratch.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # --- Build a single rotated tile ---
    padding = font_size          # breathing room so rotation doesn't clip
    tile_w = text_w + padding * 2
    tile_h = text_h + padding * 2

    tile = Image.new("RGBA", (tile_w, tile_h), (0, 0, 0, 0))
    tile_draw = ImageDraw.Draw(tile)
    tile_draw.text(
        (padding - bbox[0], padding - bbox[1]),
        text,
        font=font,
        fill=(255, 255, 255, opacity),
        stroke_width=max(1, font_size // 18),
        stroke_fill=(0, 0, 0, opacity // 2),
    )
    tile = tile.rotate(angle, expand=True, resample=Image.BICUBIC)

    # --- Tile across the full canvas ---
    wm_layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    tw, th = tile.size
    # Step slightly less than tile size so gaps are minimal
    step_x = max(tw, int(img.width * 0.22))
    step_y = max(th, int(img.height * 0.18))

    for y in range(-th, img.height + th, step_y):
        # Offset every other row for a staggered grid — harder to mask
        offset = (step_x // 2) if (y // step_y) % 2 else 0
        for x in range(-tw + offset, img.width + tw, step_x):
            wm_layer.paste(tile, (x, y), tile)

    combined = Image.alpha_composite(img, wm_layer)
    return combined.convert("RGB")


# ---------------------------------------------------------------------------
# Invisible watermark layer
# ---------------------------------------------------------------------------

def apply_invisible_watermark(img_rgb: Image.Image, payload: str) -> Image.Image:
    """
    Embed a steganographic watermark using DWT+DCT frequency-domain encoding.

    This is imperceptible to the eye and survives:
      - JPEG re-compression at quality >= 70
      - Moderate resizing (> 50% of original dimension)
      - Slight color grading / brightness adjustments

    It does NOT reliably survive heavy cropping, AI upscaling, or format
    conversion to paletted modes — pair with the visible layer for full coverage.

    Payload is truncated/padded to exactly 8 bytes (64 bits) as required by
    the dwtDct encoder. Use a short identifier: initials + year + ID,
    e.g. "GV-2024A".
    """
    if not _imwatermark_available:
        log.error(
            "invisible-watermark is not installed. "
            "Run: pip install invisible-watermark\n"
            "Or add --no-invisible to skip this layer."
        )
        sys.exit(1)

    from imwatermark import WatermarkEncoder

    # Encode payload as exactly 8 bytes
    payload_bytes = payload.encode("utf-8")[:8].ljust(8, b"\x00")

    encoder = WatermarkEncoder()
    encoder.set_watermark("bytes", payload_bytes)

    # imwatermark works with BGR numpy arrays (OpenCV convention)
    img_bgr = np.array(img_rgb)[:, :, ::-1].copy()
    encoded_bgr = encoder.encode(img_bgr, "dwtDct")

    # Convert back to RGB PIL Image
    encoded_rgb = encoded_bgr[:, :, ::-1]
    return Image.fromarray(encoded_rgb)


# ---------------------------------------------------------------------------
# Per-file processing
# ---------------------------------------------------------------------------

def process_file(
    src: Path,
    dst: Path,
    *,
    visible_text: str,
    invisible_payload: str,
    opacity: int,
    font_size: int,
    angle: float,
    quality: int,
    do_visible: bool,
    do_invisible: bool,
    overwrite: bool,
) -> bool:
    """Process a single JPEG. Returns True on success."""
    if dst.exists() and not overwrite:
        log.info("Skipping (already exists): %s", dst.name)
        return True

    try:
        img = Image.open(src)

        # Preserve EXIF if present
        exif = img.info.get("exif", b"")

        # Ensure RGB — some JPEGs are CMYK or have alpha
        img = img.convert("RGB")

        if do_visible:
            log.debug("  Applying visible watermark…")
            img = apply_visible_watermark(img, visible_text, opacity, font_size, angle)

        if do_invisible:
            log.debug("  Applying invisible watermark…")
            img = apply_invisible_watermark(img, invisible_payload)

        dst.parent.mkdir(parents=True, exist_ok=True)
        save_kwargs = {"format": "JPEG", "quality": quality, "optimize": True}
        if exif:
            save_kwargs["exif"] = exif

        img.save(dst, **save_kwargs)
        log.info("  ✓ %s → %s", src.name, dst.name)
        return True

    except Exception as exc:
        log.error("  ✗ Failed on %s: %s", src.name, exc)
        return False


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Apply dual-layer watermarks to fine art JPEG images.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("input_dir",  type=Path, help="Directory containing source JPEGs")
    p.add_argument("output_dir", type=Path, help="Directory for watermarked output")

    p.add_argument("--text",        default="© Artist Name",
                   help="Visible watermark text  [default: '© Artist Name']")
    p.add_argument("--opacity",     type=int, default=45,
                   help="Visible opacity 0–255  [default: 45]")
    p.add_argument("--font-size",   type=int, default=28, dest="font_size",
                   help="Font size in pixels  [default: 28]")
    p.add_argument("--angle",       type=float, default=-30.0,
                   help="Tile rotation angle in degrees  [default: -30]")
    p.add_argument("--invisible",   default=None,
                   help="Invisible payload string (max 8 bytes). Defaults to --text.")
    p.add_argument("--no-visible",  action="store_true", dest="no_visible",
                   help="Skip visible watermark layer")
    p.add_argument("--no-invisible", action="store_true", dest="no_invisible",
                   help="Skip invisible watermark layer")
    p.add_argument("--quality",     type=int, default=88,
                   help="Output JPEG quality 1–95  [default: 88]")
    p.add_argument("--suffix",      default="",
                   help="Filename suffix before extension  [default: '' (no suffix)]")
    p.add_argument("--overwrite",   action="store_true",
                   help="Overwrite existing output files")
    p.add_argument("--inplace",     action="store_true",
                   help="Write output back into INPUT_DIR (overrides OUTPUT_DIR). "
                        "Uses an atomic temp-file replace so the original is never "
                        "left in a partially-written state.")
    p.add_argument("--exclude-pattern", nargs="*", default=["-800w", "-1200w", "_wm"],
                   dest="exclude_patterns",
                   help="Skip source files whose stem contains any of these strings "
                        "[default: -800w -1200w _wm]")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="Verbose per-file logging")
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if args.verbose:
        log.setLevel(logging.DEBUG)

    # --- Validation ---
    if not args.input_dir.is_dir():
        log.error("Input directory not found: %s", args.input_dir)
        return 2

    if args.no_visible and args.no_invisible:
        log.error("Both --no-visible and --no-invisible specified — nothing to do.")
        return 2

    if not args.no_invisible and not _imwatermark_available:
        log.error(
            "invisible-watermark is not installed.\n"
            "  pip install invisible-watermark\n"
            "Or pass --no-invisible to skip that layer."
        )
        return 2

    # --- Collect source files ---
    jpeg_extensions = {".jpg", ".jpeg", ".JPG", ".JPEG"}
    exclude_patterns = args.exclude_patterns or []

    def _is_excluded(path: Path) -> bool:
        return any(pat in path.stem for pat in exclude_patterns)

    sources = sorted(
        f for f in args.input_dir.rglob("*")
        if f.suffix in jpeg_extensions and not _is_excluded(f)
    )

    if not sources:
        log.warning("No eligible JPEG files found in %s", args.input_dir)
        return 0

    invisible_payload = args.invisible or args.text

    # In-place mode: output goes back to the source directory, no suffix,
    # using a temp file so originals are never partially overwritten.
    inplace = args.inplace
    if inplace:
        log.info("Mode: IN-PLACE (source files will be replaced)")

    log.info("Processing %d file(s)%s",
             len(sources),
             f"  →  {args.output_dir}" if not inplace else "")
    log.info("  Visible : %s  (text=%r  opacity=%d  font=%dpx  angle=%.0f°)",
             "ON" if not args.no_visible else "OFF",
             args.text, args.opacity, args.font_size, args.angle)
    log.info("  Invisible: %s  (payload=%r)",
             "ON" if not args.no_invisible else "OFF",
             invisible_payload[:8])

    # --- Process ---
    import tempfile
    ok = 0
    fail = 0
    for src in sources:
        if inplace:
            # Write to a sibling temp file, then atomically replace the original
            tmp_fd, tmp_path = tempfile.mkstemp(
                suffix=".jpg", dir=src.parent, prefix=".wm_tmp_"
            )
            os.close(tmp_fd)
            dst = Path(tmp_path)
        else:
            # Preserve subdirectory structure relative to input_dir
            rel = src.relative_to(args.input_dir)
            stem = rel.stem + args.suffix
            dst = args.output_dir / rel.parent / (stem + ".jpg")

        success = process_file(
            src, dst,
            visible_text=args.text,
            invisible_payload=invisible_payload,
            opacity=args.opacity,
            font_size=args.font_size,
            angle=args.angle,
            quality=args.quality,
            do_visible=not args.no_visible,
            do_invisible=not args.no_invisible,
            overwrite=True if inplace else args.overwrite,
        )
        if success:
            if inplace:
                # Atomic replace: move temp file over the original
                os.replace(dst, src)
            ok += 1
        else:
            if inplace and dst.exists():
                dst.unlink()   # clean up failed temp file
            fail += 1

    # --- Summary ---
    log.info("Done — %d succeeded, %d failed.", ok, fail)
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main())