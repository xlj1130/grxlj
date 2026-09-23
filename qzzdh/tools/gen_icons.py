# -*- coding: utf-8 -*-
"""
生成扩展图标（icon16 / icon48 / icon128）。
纯 Python 标准库实现 PNG 编码，无需 Pillow。
图案：蓝色渐变圆角方块 + 白色对勾，呼应“投递成功”。
"""
import struct
import zlib
import math
import os


def chunk(tag, data):
    c = struct.pack(">I", len(data)) + tag + data
    c += struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return c


def seg_dist(px, py, x1, y1, x2, y2):
    """点到线段距离"""
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0, min(1, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def make_icon(size):
    radius = size * 0.22
    c0 = (79, 110, 247)    # 主色
    c1 = (124, 143, 247)   # 渐变亮色
    rows = []
    for y in range(size):
        row = bytearray()
        row.append(0)  # filter type
        for x in range(size):
            # 圆角遮罩
            cx = min(max(x, radius), size - radius)
            cy = min(max(y, radius), size - radius)
            inside = math.hypot(x - cx, y - cy) <= radius
            if not inside:
                row += bytes((0, 0, 0, 0))
                continue
            # 渐变
            t = (x + y) / (2 * (size - 1))
            r = int(c0[0] + (c1[0] - c0[0]) * t)
            g = int(c0[1] + (c1[1] - c0[1]) * t)
            b = int(c0[2] + (c1[2] - c0[2]) * t)
            # 白色对勾（两段线段）
            s = size
            d1 = seg_dist(x, y, s * 0.26, s * 0.54, s * 0.44, s * 0.70)
            d2 = seg_dist(x, y, s * 0.44, s * 0.70, s * 0.76, s * 0.34)
            stroke = s * 0.09
            if d1 <= stroke or d2 <= stroke:
                r, g, b = 255, 255, 255
            row += bytes((r, g, b, 255))
        rows.append(bytes(row))
    raw = b"".join(rows)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    return png


def main():
    out_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    out_dir = os.path.normpath(out_dir)
    os.makedirs(out_dir, exist_ok=True)
    for size in (16, 48, 128):
        path = os.path.join(out_dir, f"icon{size}.png")
        with open(path, "wb") as f:
            f.write(make_icon(size))
        print(f"generated: {path}")


if __name__ == "__main__":
    main()
