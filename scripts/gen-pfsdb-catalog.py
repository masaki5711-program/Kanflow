# -*- coding: utf-8 -*-
"""pfsdb カタログ再生成の入口（後方互換ラッパー）。

2026-08-28 以降、pfsdb のカタログ・SQLite 参照 DB・schema-manifest は
docs/iotpf-build-kit/db/tools/build_fullstack_db.py が一括生成する。
本スクリプトはそれを呼ぶだけの薄いラッパーで、旧来の入口
(`python scripts/gen-pfsdb-catalog.py`) を保つ。

出力: docs/iotpf-build-kit/db/pfsdb-catalog.md ほか（build_fullstack_db.py 参照）
規範: docs/iotpf-build-kit/db/SQL-iotdb_Rev1.19.sql + migrations/*.sql — DDL が正。
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
BUILDER = REPO_ROOT / "docs" / "iotpf-build-kit" / "db" / "tools" / "build_fullstack_db.py"

if __name__ == "__main__":
    if not BUILDER.exists():
        sys.exit(f"builder not found: {BUILDER}")
    sys.argv = [str(BUILDER)]
    runpy.run_path(str(BUILDER), run_name="__main__")
