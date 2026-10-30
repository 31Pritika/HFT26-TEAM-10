"""Draws the cyan scope-ring icons with the standard library: `python extension/make_icons.py`."""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

CYAN = (34, 211, 238)
BACKGROUND = (5, 6, 10)
SAMPLES = 4          # supersampling per axis, for smooth edges at 16 px
OUTPUT = Path(__file__).parent / "icons"


def _covered(x: float, y: float) -> tuple[bool, bool]:
    """In unit coordinates around the centre: is this point on the mark, and on the background tile?"""
    radius = math.hypot(x, y)
    ring = 0.56 <= radius <= 0.72
    dot = radius <= 0.17
    tick = (abs(x) <= 0.06 and 0.44 <= abs(y) <= 0.86) or (abs(y) <= 0.06 and 0.44 <= abs(x) <= 0.86)
    corner = max(abs(x) - 0.72, 0), max(abs(y) - 0.72, 0)
    return ring or dot or tick, math.hypot(*corner) <= 0.28


def _pixel(px: int, py: int, size: int) -> bytes:
    mark = tile = 0
    for i in range(SAMPLES):
        for j in range(SAMPLES):
            x = (px + (i + 0.5) / SAMPLES) / size * 2 - 1
            y = (py + (j + 0.5) / SAMPLES) / size * 2 - 1
            on_mark, on_tile = _covered(x, y)
            mark += on_mark
            tile += on_tile
    share = mark / max(tile, 1)
    colour = [round(b + (c - b) * share) for b, c in zip(BACKGROUND, CYAN)]
    return bytes((*colour, round(255 * tile / SAMPLES ** 2)))


def _chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))


def png(size: int) -> bytes:
    rows = b"".join(b"\0" + b"".join(_pixel(x, y, size) for x in range(size)) for y in range(size))
    header = struct.pack("!IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", header) + _chunk(b"IDAT", zlib.compress(rows, 9)) + _chunk(b"IEND", b"")


if __name__ == "__main__":
    OUTPUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        (OUTPUT / f"icon{size}.png").write_bytes(png(size))
