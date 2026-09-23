# -*- coding: utf-8 -*-
"""自检脚本：校验 manifest.json、图标 PNG、以及各 JS 文件的基本括号配平。"""
import json
import os
import re

BASE = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))


def check_manifest():
    path = os.path.join(BASE, "manifest.json")
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    print("[OK] manifest.json 合法 JSON")
    # 校验引用的文件是否存在
    refs = []
    refs += list(data.get("icons", {}).values())
    refs.append(data["background"]["service_worker"])
    refs.append(data["action"]["default_popup"])
    for cs in data.get("content_scripts", []):
        refs += cs.get("js", []) + cs.get("css", [])
    missing = [r for r in refs if not os.path.exists(os.path.join(BASE, r))]
    if missing:
        print("[FAIL] 引用文件缺失:", missing)
        return False
    print("[OK] manifest 引用的所有文件均存在")
    return True


def check_png():
    ok = True
    for size in (16, 48, 128):
        p = os.path.join(BASE, "icons", f"icon{size}.png")
        with open(p, "rb") as f:
            head = f.read(8)
        good = head == b"\x89PNG\r\n\x1a\n"
        print(f"[{'OK' if good else 'FAIL'}] icon{size}.png 头合法: {good}")
        ok = ok and good
    return ok


def check_js_balance():
    ok = True
    for name in ["popup.js", "content.js", "background.js", os.path.join("config", "sites.js")]:
        p = os.path.join(BASE, name)
        src = open(p, encoding="utf-8").read()
        # 去掉块注释与行注释后再配平，避免注释里的 ) 造成误报
        stripped = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
        stripped = re.sub(r"//[^\n]*", "", stripped)
        balanced = True
        for o, c in [("{", "}"), ("(", ")"), ("[", "]")]:
            if stripped.count(o) != stripped.count(c):
                print(f"[WARN] {name} 去注释后括号 {o}{c} 不一致: {stripped.count(o)} vs {stripped.count(c)}")
                balanced = False
                ok = False
        tag = "OK" if balanced else "WARN"
        print(f"[{tag}] {name} 括号配平正常, 行数 {len(src.splitlines())}")
    return ok


if __name__ == "__main__":
    r1 = check_manifest()
    r2 = check_png()
    r3 = check_js_balance()
    print("\n自检结果:", "全部通过" if (r1 and r2 and r3) else "存在告警，请查看上方")
