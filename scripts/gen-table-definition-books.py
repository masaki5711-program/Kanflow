# -*- coding: utf-8 -*-
"""Generate the complete table-definition workbooks (JA + ID) for IoTPF.

Sources:
  - docs/old/Doc_IoTplatform/SQL-iotdb_Rev1.15(フルファイル).sql      (JA comments)
  - docs/old/Doc_IoTplatform_ID/SQL-iotdb_Rev1.15(File-Lengkap).sql  (ID comments)
  - docs/spec/IoT.md/ai-data-model.md   (draft AI DDL, inline comments)
  - docs/spec/IoT.md/pfe-database.md / oee-calculation.md (hand-encoded specs)

Layout mirrors 21_IoTPF_テーブル定義書_2次データ.xlsx, augmented with
配置(PFS/PFE) / 区分 / 状態 / 目的・説明 rows and a TOC sheet.
"""
import re
from pathlib import Path

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

DOCS = str(Path(__file__).resolve().parent.parent / "docs")
SQL_JA = DOCS + r"/old/Doc_IoTplatform/SQL-iotdb_Rev1.15(フルファイル).sql"
SQL_ID = DOCS + r"/old/Doc_IoTplatform_ID/SQL-iotdb_Rev1.15(File-Lengkap).sql"
AI_MD = DOCS + r"/spec/IoT.md/ai-data-model.md"
OUT_JA_PFS = DOCS + r"/old/Doc_IoTplatform/31_IoTPF_テーブル定義書_完全版_PFS.xlsx"
OUT_JA_PFE = DOCS + r"/old/Doc_IoTplatform/32_IoTPF_テーブル定義書_完全版_PFE.xlsx"
OUT_ID_PFS = DOCS + r"/old/Doc_IoTplatform_ID/31_IoTPF_Definisi-Tabel_Lengkap_PFS.xlsx"
OUT_ID_PFE = DOCS + r"/old/Doc_IoTplatform_ID/32_IoTPF_Definisi-Tabel_Lengkap_PFE.xlsx"
GEN_DATE = "2026-08-11"

TYPE_RE = re.compile(
    r"^(VARCHAR|CHAR|NUMERIC|DECIMAL)\s*\((\d+)(?:\s*,\s*(\d+))?\)"
    r"|^(DOUBLE PRECISION|TIMESTAMPTZ|TEXT|UUID\[\]|UUID|INTEGER\[\]|INTEGER|"
    r"BIGINT|SERIAL|DATE|BOOLEAN|BYTEA|JSONB|REAL|SMALLINT)")


def parse_type(rest):
    """Return (base_type, length, precision, not_null, default, tail)."""
    m = TYPE_RE.match(rest)
    if not m:
        return (rest.split()[0].rstrip(","), "", "",
                "NOT NULL" in rest, "", "")
    if m.group(1):
        base, length, prec = m.group(1), m.group(2), m.group(3) or ""
    else:
        base, length, prec = m.group(4), "", ""
    tail = rest[m.end():]
    not_null = "NOT NULL" in tail
    dm = re.search(r"DEFAULT\s+([^,\s][^,]*?)(?:\s+(?:NOT NULL|CHECK)|,|$)", tail)
    default = dm.group(1).strip() if dm else ""
    return base, length, prec, not_null, default, tail


def parse_full_sql(path):
    """Parse Rev1.15-style DDL: columns from CREATE TABLE, names/remarks from COMMENT ON."""
    text = open(path, encoding="utf-8").read()
    tables = {}
    for m in re.finditer(r"CREATE TABLE (pfs)\.(\w+)\s*\((.*?)\)\s*;", text, re.S):
        schema, name, body = m.group(1), m.group(2), m.group(3)
        cols = []
        depth = 0
        for line in body.splitlines():
            s = line.strip().rstrip(",")
            if not s:
                continue
            if depth > 0:
                depth += s.count("(") - s.count(")")
                continue
            depth += s.count("(") - s.count(")")
            cm = re.match(r"([a-z_][a-z0-9_]*)\s+(.+)$", s)
            if not cm or cm.group(1) in ("constraint", "check"):
                continue
            cname, rest = cm.group(1), cm.group(2)
            base, length, prec, nn, default, _ = parse_type(rest)
            cols.append(dict(name=cname, type=base, len=length, prec=prec,
                             nn=nn, default=default, logical="", remark=""))
        tables[name] = dict(schema=schema, cols=cols, logical=name, remark="", pk_name="", pk_cols="")
    for m in re.finditer(r"ALTER TABLE pfs\.(\w+)\s+ADD CONSTRAINT (pk_\w+) PRIMARY KEY\s*\(([^)]*)\)", text):
        t = tables.get(m.group(1))
        if t:
            t["pk_name"] = m.group(2)
            t["pk_cols"] = ", ".join(c.strip() for c in m.group(3).split(","))
    for m in re.finditer(r"COMMENT ON TABLE pfs\.(\w+) IS '([^']*)'", text):
        t = tables.get(m.group(1))
        if t:
            lines = m.group(2).splitlines()
            t["logical"] = lines[0].strip()
            t["remark"] = " / ".join(x.strip() for x in lines[1:] if x.strip())
    for m in re.finditer(r"COMMENT ON COLUMN pfs\.(\w+)\.(\w+) IS '([^']*)'", text):
        t = tables.get(m.group(1))
        if not t:
            continue
        for c in t["cols"]:
            if c["name"] == m.group(2):
                lines = m.group(3).splitlines()
                c["logical"] = lines[0].strip()
                c["remark"] = "\n".join(x.strip() for x in lines[1:] if x.strip())
                break
    return tables


def parse_draft_sql(md_path):
    """Parse draft CREATE TABLE blocks (inline -- comments) from ai-data-model.md."""
    text = open(md_path, encoding="utf-8").read()
    tables = {}
    for m in re.finditer(r"CREATE TABLE pfs\.(\w+)\s*\((.*?)\n\);", text, re.S):
        name, body = m.group(1), m.group(2)
        cols = []
        pk_name, pk_cols = "", ""
        has_audit8 = "監査8列" in body
        depth = 0
        for line in body.splitlines():
            s = line.strip().rstrip(",")
            comment = ""
            if "--" in s:
                s, comment = s.split("--", 1)[0].strip().rstrip(","), s.split("--", 1)[1].strip()
            if not s:
                continue
            if depth > 0:
                depth += s.count("(") - s.count(")")
                continue
            if s.upper().startswith("CONSTRAINT") or s.upper().startswith("CHECK"):
                pm = re.match(r"CONSTRAINT\s+(pk_\w+)\s+PRIMARY KEY\s*\(([^)]*)\)", s, re.I)
                if pm:
                    pk_name = pm.group(1)
                    pk_cols = ", ".join(c.strip() for c in pm.group(2).split(","))
                depth += s.count("(") - s.count(")")
                continue
            depth += s.count("(") - s.count(")")
            cm = re.match(r"([a-z_][a-z0-9_]*)\s+(.+)$", s)
            if not cm:
                continue
            base, length, prec, nn, default, _ = parse_type(re.sub(r"\s+", " ", cm.group(2)))
            cols.append(dict(name=cm.group(1), type=base, len=length, prec=prec,
                             nn=nn, default=default, logical="", remark=comment))
        tables[name] = dict(schema="pfs", cols=cols, logical=name, remark="",
                            pk_name=pk_name, pk_cols=pk_cols, audit8=has_audit8)
    return tables


# ---------------------------------------------------------------- metadata --

L = {  # UI labels per language
    "ja": dict(
        toc="目次", title="IoTPF テーブル定義書（完全版）",
        title_pfs="IoTPF テーブル定義書 完全版 ― PFS（中央・2次側 pfsdb）",
        title_pfe="IoTPF テーブル定義書 完全版 ― PFE（現場・1次側）",
        subtitle=("生成元: SQL-iotdb Rev1.15 フルDDL＋docs/iotpf-spec 分冊"
                  "（ai-data-model.md / pfe-database.md / oee-calculation.md）。生成日: " + GEN_DATE),
        logical_tbl="論理テーブル名（エンティティ名）", author="作成者", made="作成日",
        author_v="", phys="物理テーブル名", schema="スキーマ",
        place="配置", cate="区分", status="状態", purpose="目的・説明",
        hdr=["No.", "論　理　名", "物　理　名", "型", "長さ", "精度", "必須", "主キー", "備　考"],
        pk="主キー", note="補足", to_toc="→ 目次へ",
        toc_hdr=["No.", "物理テーブル名", "論理名", "配置", "スキーマ", "区分", "状態", "説明"],
        pfs="PFS（中央）", pfe="PFE（現場）",
        no_sheet="（シート無し・構想段階）",
        audit=None,
    ),
    "id": dict(
        toc="Daftar Isi", title="Definisi Tabel IoTPF (Edisi Lengkap)",
        title_pfs="Definisi Tabel IoTPF Edisi Lengkap - PFS (pusat, sisi sekunder pfsdb)",
        title_pfe="Definisi Tabel IoTPF Edisi Lengkap - PFE (lapangan, sisi primer)",
        subtitle=("Sumber: DDL lengkap SQL-iotdb Rev1.15 + dokumen docs/iotpf-spec "
                  "(ai-data-model.md / pfe-database.md / oee-calculation.md). Tanggal: " + GEN_DATE),
        logical_tbl="Nama tabel logis (nama entitas)", author="Pembuat", made="Tanggal dibuat",
        author_v="", phys="Nama tabel fisik", schema="Skema",
        place="Penempatan", cate="Kategori", status="Status", purpose="Tujuan & penjelasan",
        hdr=["No.", "Nama Logis", "Nama fisik", "Tipe", "Panjang", "Presisi", "Wajib", "Primary key", "Keterangan"],
        pk="Primary key", note="Catatan", to_toc="→ Daftar Isi",
        toc_hdr=["No.", "Nama tabel fisik", "Nama logis", "Penempatan", "Skema", "Kategori", "Status", "Penjelasan"],
        pfs="PFS (pusat)", pfe="PFE (lapangan)",
        no_sheet="(tanpa sheet - tahap konsep)",
        audit=None,
    ),
}

ST = {  # status vocabulary
    "fixed": ("確定（SQL-iotdb Rev1.15）", "Final (SQL-iotdb Rev1.15)"),
    "frozen": ("確定・凍結（ランタイム変更禁止）", "Final & dibekukan (dilarang diubah saat runtime)"),
    "draft": ("ドラフト（DDL未確定）", "Draf (DDL belum final)"),
    "proposal": ("提案（oee-calculation.md §2）", "Usulan (oee-calculation.md §2)"),
    "ref": ("参照実装（edge-ref）", "Implementasi referensi (edge-ref)"),
    "example": ("設計例（pfe-database.md §3.0）", "Contoh desain (pfe-database.md §3.0)"),
    "concept": ("構想（pfe-fleet-management.md §6）", "Konsep (pfe-fleet-management.md §6)"),
}

CAT = {
    "mm_m": ("製造マスタ（ヤマハ製造モデル）", "Master manufaktur (Model Manufaktur Yamaha)"),
    "mm_ymes": ("YMES連携マスタ（Tier-3の継ぎ目）", "Master integrasi YMES (antarmuka Tier-3)"),
    "m2": ("Tier-2 識別マスタ（凍結）", "Master identifikasi Tier-2 (dibekukan)"),
    "t2": ("Tier-2 状態/移動履歴（凍結）", "Riwayat status/pergerakan Tier-2 (dibekukan)"),
    "te_etl": ("ETLリネージログ", "Log lineage ETL"),
    "te_oper": ("操作ログ", "Log operasi"),
    "tm": ("YMES連携ログ", "Log integrasi YMES"),
    "me_edge": ("エッジ基盤（台帳・カタログ）", "Platform edge (registri & katalog)"),
    "me_user": ("ユーザー・権限", "Pengguna & otorisasi"),
    "mp": ("ポータル表示設定", "Konfigurasi tampilan portal"),
    "ai": ("AIサービス（Flow B 判断レコード系）", "Layanan AI (rekaman penilaian Flow B)"),
    "std": ("標準値マスタ（OEE/OLE理論値）", "Master nilai standar (nilai teoretis OEE/OLE)"),
    "t1c1": ("Tier-1 クラス①標準写像イベント", "Tier-1 kelas 1: event terpetakan standar"),
    "t1c2": ("Tier-1 クラス②ローカル専用詳細", "Tier-1 kelas 2: detail khusus lokal"),
    "t1c3": ("クラス③エッジ内部運用", "Kelas 3: operasional internal edge"),
}


def cat_of(name):
    if name.startswith("mm_ymes"):
        return CAT["mm_ymes"]
    if name.startswith("mm_m_std"):
        return CAT["std"]
    if name.startswith("mm_m"):
        return CAT["mm_m"]
    if name.startswith("m2"):
        return CAT["m2"]
    if name.startswith("t2"):
        return CAT["t2"]
    if name.startswith("te_etl"):
        return CAT["te_etl"]
    if name.startswith("te_oper"):
        return CAT["te_oper"]
    if name.startswith("te_ai") or name.startswith("me_ai"):
        return CAT["ai"]
    if name.startswith("tm"):
        return CAT["tm"]
    if name.startswith("me_edge"):
        return CAT["me_edge"]
    if name.startswith("me_"):
        return CAT["me_user"]
    if name.startswith("mp"):
        return CAT["mp"]
    return ("", "")


# Purpose texts (ja, id) — the "what is this table for" the user asked for.
P = {
    # --- masters -----------------------------------------------------------
    "mm_m_item": (
        "品目マスタ（GMC）。YMES 由来の品目台帳で、Tier-2 履歴の item_code の解決先。在庫単位・評価クラス・既定の保管場所を保持する。",
        "Master item (GMC). Daftar item dari YMES; menjadi acuan resolusi item_code pada riwayat Tier-2. Menyimpan satuan stok, kelas valuasi, dan lokasi penyimpanan default."),
    "mm_m_process": (
        "プロセス（工程）マスタ。作業（mm_m_work）の上位区分で、Tier-2 履歴の process_id の解決先。",
        "Master proses. Pengelompokan di atas pekerjaan (mm_m_work); acuan resolusi process_id pada riwayat Tier-2."),
    "mm_m_work": (
        "作業マスタ。標準作業の台帳で、Tier-2 履歴の work_id の解決先。OEE/OLE の標準値マスタ（mm_m_std_time 提案）の結合キーでもある。",
        "Master pekerjaan. Daftar pekerjaan standar; acuan resolusi work_id pada riwayat Tier-2, sekaligus kunci join master nilai standar (usulan mm_m_std_time) untuk OEE/OLE."),
    "mm_m_workctr": (
        "ワークセンター（作業区）マスタ。場所階層の最上位。コストセンターを保持。",
        "Master work center (area kerja). Tingkat teratas hierarki lokasi; menyimpan cost center."),
    "mm_m_work_station": (
        "ワークステーション（ライン）マスタ。ワークセンター配下のライン。コストセンター・MRPコントローラを保持。",
        "Master workstation (lini). Lini di bawah work center; menyimpan cost center dan MRP controller."),
    "mm_m_work_resource": (
        "作業リソースマスタ。設備（machine_id）または人（staff_id）を作業資源として登録する。t2_material_work_hist（良否数量）と設備・人を橋渡しする — OEE 良品率の設備紐付けキー。",
        "Master sumber daya kerja. Mendaftarkan mesin (machine_id) atau orang (staff_id) sebagai sumber daya kerja. Menjembatani t2_material_work_hist (jumlah OK/NG) dengan mesin/orang - kunci atribusi tingkat kualitas OEE ke mesin."),
    "mm_m_storage_area": (
        "ストレージエリアマスタ（YMES: storageArea）。保管場所階層の上位。",
        "Master storage area (YMES: storageArea). Tingkat atas hierarki lokasi penyimpanan."),
    "mm_m_storage_location": (
        "ストレージロケーションマスタ（YMES: storageLocation）。保管の物理位置。",
        "Master storage location (YMES: storageLocation). Posisi fisik penyimpanan."),
    "mm_ymes_linkage_info": (
        "YMES 取得連携テーブル情報。どのテーブルを YMES からどう取得するかの設定（Tier-3 連携の継ぎ目 — Tier-3 本体は未実装）。",
        "Informasi tabel integrasi pengambilan YMES. Konfigurasi tabel mana yang diambil dari YMES dan caranya (antarmuka Tier-3 - Tier-3 sendiri belum diimplementasikan)."),
    "mm_ymes_linkage_schedule": (
        "YMES 取得連携スケジュール。取得ジョブの実行予定の定義。",
        "Jadwal integrasi pengambilan YMES. Definisi jadwal eksekusi job pengambilan."),
    "tm_ymes_linkage_log": (
        "YMES 取得処理ログ。連携ジョブの実行結果・エラーの記録（ログ＋メール通知の運用対象）。",
        "Log proses pengambilan YMES. Rekaman hasil eksekusi dan error job integrasi (objek operasional log + notifikasi email)."),
    # --- m2 ----------------------------------------------------------------
    "m2_person_identification": (
        "ヒト識別マスタ。IoTヒトID（サロゲート）と UID・社員ID を対応付ける同定マスタ。Tier-2 ヒト履歴の主体軸の解決先。凍結対象。",
        "Master identifikasi orang. Memetakan ID orang IoT (surrogate) dengan UID dan ID karyawan. Acuan sumbu subjek riwayat orang Tier-2. Termasuk lingkup pembekuan."),
    "m2_material_identification": (
        "モノ識別マスタ。IoTモノIDと現物ID・ラベルNo・製造指示等を対応付ける同定マスタ。Tier-2 モノ履歴の主体軸の解決先。凍結対象。",
        "Master identifikasi material. Memetakan ID material IoT dengan ID fisik, No label, instruksi produksi, dll. Acuan sumbu subjek riwayat material Tier-2. Termasuk lingkup pembekuan."),
    "m2_machine_identification": (
        "機械識別マスタ。IoT機械ID（サロゲート）と YMES 機械ID・固定ロケーションを対応付ける。Tier-2 機械履歴の主体軸の解決先。凍結対象。",
        "Master identifikasi mesin. Memetakan ID mesin IoT (surrogate) dengan ID mesin YMES dan lokasi tetap. Acuan sumbu subjek riwayat mesin Tier-2. Termasuk lingkup pembekuan."),
    "m2_iot_location": (
        "IoTロケーションマスタ。場所軸の解決先。ワークセンター／ワークステーション／作業リソース／保管場所へのリンクを持つ。凍結対象。",
        "Master lokasi IoT. Acuan sumbu lokasi; memiliki tautan ke work center / workstation / sumber daya kerja / lokasi penyimpanan. Termasuk lingkup pembekuan."),
    # --- t2 person ---------------------------------------------------------
    "t2_person_work_hist": (
        "ヒト作業履歴。直接作業の開始/終了区間（作業・製造指示・品目・員数付き）。OLE の直接作業時間と労働性能（標準工数×出来高）の源泉。",
        "Riwayat pekerjaan orang. Interval mulai/selesai pekerjaan langsung (dengan pekerjaan, instruksi produksi, item, jumlah). Sumber waktu kerja langsung dan performa tenaga kerja OLE (waktu standar x output)."),
    "t2_person_nwork_hist": (
        "ヒト作業外業務履歴。作業外区間を時間管理7分類（5d間接・5eムダ等）付きで記録。OLE ロス内訳の説明に使う。",
        "Riwayat aktivitas non-kerja orang. Interval non-kerja dengan 7 kategori pengendalian waktu (5d tidak langsung, 5e pemborosan, dll). Untuk penjelasan rincian loss OLE."),
    "t2_person_move_hist": (
        "ヒト移動履歴。人の滞在場所と滞在区間（どこに・いつからいつまで）。動線・レイアウト検証に使う。",
        "Riwayat pergerakan orang. Lokasi dan interval keberadaan orang (di mana, dari kapan sampai kapan). Untuk verifikasi alur gerak dan layout."),
    "t2_person_time_ctrl_hist": (
        "ヒト時間管理履歴。人×実績日×シフトの承認済み就業時間台帳（規定就業時間・手入力時間・承認者）。OLE の分母（労働負荷時間）。エッジ未接続でも手入力で成立（DXレベル耐性）。",
        "Riwayat pengendalian waktu orang. Buku besar jam kerja yang disetujui per orang x tanggal x shift (jam kerja resmi, input manual, penyetuju). Penyebut OLE (waktu beban kerja). Tetap berfungsi lewat input manual tanpa edge (toleransi tingkat DX)."),
    # --- t2 material -------------------------------------------------------
    "t2_material_work_hist": (
        "モノ作業履歴。作業単位の完成/廃棄数量（ok_qty／ng_qty）・作業印（作業者）を記録。OEE/OLE の良品率の源泉。作業リソース経由で設備へ、作業印で人へ紐付く。",
        "Riwayat pekerjaan material. Mencatat jumlah selesai/dibuang (ok_qty/ng_qty) per pekerjaan dan tanda pekerja. Sumber tingkat kualitas OEE/OLE. Terhubung ke mesin via sumber daya kerja, ke orang via tanda pekerja."),
    "t2_material_process_hist": (
        "モノプロセス履歴。個体/ロットのプロセス実行区間（開始〜完了/中止）。",
        "Riwayat proses material. Interval eksekusi proses per unit/lot (mulai - selesai/batal)."),
    "t2_material_process_wait_hist": (
        "モノプロセス滞留履歴。プロセス内の待ち区間。滞留のボトルネック分析に使う。",
        "Riwayat antrian proses material. Interval menunggu dalam proses; untuk analisis bottleneck."),
    "t2_material_move_hist": (
        "モノ移動履歴。モノの場所間移動と滞在区間。トレーサビリティの場所軸。",
        "Riwayat pergerakan material. Perpindahan antar lokasi dan interval keberadaan material. Sumbu lokasi untuk traceability."),
    "t2_material_storage_hist": (
        "モノストレージ履歴。保管状態の区間（入庫〜出庫）。在庫・保管の実績。",
        "Riwayat penyimpanan material. Interval status penyimpanan (masuk - keluar). Realisasi stok/penyimpanan."),
    "t2_material_storage_move_hist": (
        "モノストレージ移動履歴。保管場所間の移動区間。",
        "Riwayat perpindahan penyimpanan material. Interval perpindahan antar lokasi penyimpanan."),
    "t2_material_storage_stay_hist": (
        "モノストレージ滞留履歴。保管での滞留区間。長期滞留の検知に使う。",
        "Riwayat lama tinggal penyimpanan material. Interval menetap di penyimpanan; untuk deteksi stok menumpuk."),
    "t2_material_consu_hist": (
        "モノ使用（消費）履歴。材料の消費区間・数量。使用実績と原単位分析の源泉。",
        "Riwayat konsumsi material. Interval dan jumlah konsumsi material. Sumber realisasi pemakaian dan analisis unit consumption."),
    # --- t2 machine --------------------------------------------------------
    "t2_machine_oper_hist": (
        "機械運転履歴。運転区間（Start Operation〜Stop Operation）。OEE 時間稼働率の分子（稼働時間）の実測源。",
        "Riwayat operasi mesin. Interval operasi (Start Operation - Stop Operation). Sumber pengukuran waktu operasi, pembilang availability OEE."),
    "t2_machine_noper_hist": (
        "機械非運転履歴。非運転区間を時間管理7分類（5d段取り・5e故障停止等）と理由付きで記録。OEE 停止ロスの内訳。",
        "Riwayat non-operasi mesin. Interval non-operasi dengan 7 kategori pengendalian waktu (5d setup, 5e berhenti karena kerusakan, dll) dan alasannya. Rincian loss berhenti OEE."),
    "t2_machine_work_hist": (
        "機械作業履歴。機械の作業区間と出来高（qty）・製造指示・品目。OEE 性能稼働率（理論CT×出来高）の出来高源。",
        "Riwayat pekerjaan mesin. Interval pekerjaan mesin dengan output (qty), instruksi produksi, item. Sumber output untuk performance OEE (CT ideal x output)."),
    "t2_machine_nwork_oper_hist": (
        "機械作業外運転履歴。暖機・試運転など作業に紐付かない運転区間（時間分類付き）。",
        "Riwayat operasi non-kerja mesin. Interval operasi tanpa pekerjaan (pemanasan, uji coba) dengan kategori waktu."),
    "t2_machine_alarm_hist": (
        "機械異常履歴。異常の検知〜解除区間と重要度（Fatal/Error/Warning/Info）・解除方法。故障停止（5e）の裏付けと MTBF/MTTR 分析の源泉。",
        "Riwayat alarm mesin. Interval deteksi - pemulihan alarm dengan tingkat keparahan (Fatal/Error/Warning/Info) dan cara pemulihan. Bukti pendukung berhenti karena kerusakan (5e) dan sumber analisis MTBF/MTTR."),
    "t2_machine_move_hist": (
        "機械移動履歴。可搬設備の場所移動・滞在区間。",
        "Riwayat pergerakan mesin. Perpindahan lokasi dan interval keberadaan peralatan portabel."),
    "t2_machine_time_ctrl_hist": (
        "機械時間管理履歴。設備×実績日×シフトの承認済み時間台帳（規定就業時間・手入力時間・承認者）。OEE の分母（負荷時間）。エッジ未接続設備でも手入力で成立（DXレベル耐性）。",
        "Riwayat pengendalian waktu mesin. Buku besar waktu yang disetujui per mesin x tanggal x shift (jam kerja resmi, input manual, penyetuju). Penyebut OEE (loading time). Tetap berfungsi lewat input manual untuk mesin tanpa edge (toleransi tingkat DX)."),
    # --- te / tm logs ------------------------------------------------------
    "te_etl_person_log": (
        "ヒトETLログ。ETL 1→2 のリネージ（from/to アドレス・DML種別・実行時刻）とエラー・メール通知キュー。Tier-1↔Tier-2 の追跡と沈黙障害防止の要。",
        "Log ETL orang. Lineage ETL 1->2 (alamat from/to, jenis DML, waktu eksekusi) plus antrean error & notifikasi email. Kunci penelusuran Tier-1<->Tier-2 dan pencegahan kegagalan senyap."),
    "te_etl_material_log": (
        "モノETLログ。ETL 1→2 のリネージとエラー・メール通知キュー（モノ系）。",
        "Log ETL material. Lineage ETL 1->2 dan antrean error/notifikasi email (untuk material)."),
    "te_etl_machine_log": (
        "機械ETLログ。ETL 1→2 のリネージとエラー・メール通知キュー（機械系）。",
        "Log ETL mesin. Lineage ETL 1->2 dan antrean error/notifikasi email (untuk mesin)."),
    "te_oper_log": (
        "操作ログ。画面操作の記録（監査証跡）。",
        "Log operasi. Rekaman operasi layar (jejak audit)."),
    # --- me ----------------------------------------------------------------
    "me_edge_system": (
        "エッジシステム台帳。1 PFE = 1 行。edge_system_id が正準エッジID（ZEVA-Engine 判定イベントの target_edge_id の解決先）。場所リンク・ベンダ連絡先・PFE接続メタデータを保持。pfe_db_* 資格情報はプロビジョニング/ETL境界専用（ランタイムのデータパスではない — R2）。",
        "Registri sistem edge. 1 PFE = 1 baris. edge_system_id adalah ID edge kanonik (acuan target_edge_id pada event penilaian ZEVA-Engine). Menyimpan tautan lokasi, kontak vendor, metadata koneksi PFE. Kredensial pfe_db_* khusus provisioning/batas ETL (bukan jalur data runtime - R2)."),
    "me_edge_primary_data_table": (
        "エッジ1次データテーブルカタログ。全 PFE の Tier-1 テーブルの中央台帳。PFS はこのカタログで（PFE に接続せずに）各エッジの DB 構造を知る。カタログ同期義務（R3）の対象。",
        "Katalog tabel data primer edge. Daftar pusat tabel Tier-1 semua PFE. PFS mengetahui struktur DB tiap edge lewat katalog ini (tanpa koneksi ke PFE). Objek kewajiban sinkronisasi katalog (R3)."),
    "me_edge_primary_data_column": (
        "エッジ1次データカラムカタログ。Tier-1 各テーブルの列レベル台帳（論理名・型・必須・説明）。Edge MCP describe_local_data と一致していなければならない（ドリフト＝欠陥）。",
        "Katalog kolom data primer edge. Daftar tingkat kolom tabel Tier-1 (nama logis, tipe, wajib, deskripsi). Harus konsisten dengan describe_local_data Edge MCP (drift = cacat)."),
    "me_user": (
        "ユーザーマスタ。プラットフォーム利用者の認証情報。",
        "Master pengguna. Informasi autentikasi pengguna platform."),
    "me_role": (
        "ロールマスタ。権限ロールの定義。",
        "Master peran. Definisi peran otorisasi."),
    "me_user_role": (
        "ユーザーロール。ユーザーとロールの対応（多対多）。",
        "Peran pengguna. Pemetaan pengguna-peran (many-to-many)."),
    "me_user_edge_system": (
        "ユーザー担当エッジシステム。ユーザーが管理・参照できるエッジのスコープ定義。Edge MCP のツール別認可の裏付け。",
        "Sistem edge yang ditangani pengguna. Definisi lingkup edge yang boleh dikelola/dilihat pengguna. Dasar otorisasi per-tool Edge MCP."),
    "mp_portal_disp_cate": (
        "ポータル表示分類マスタ。L4 ポータルの表示カテゴリ設定（UI は L3 API 経由で読む）。",
        "Master kategori tampilan portal. Konfigurasi kategori tampilan portal L4 (UI membaca via API L3)."),
    "mp_portal_disp_link": (
        "ポータル表示リンクマスタ。L4 ポータルのリンク設定。",
        "Master tautan tampilan portal. Konfigurasi tautan portal L4."),
    # --- AI drafts ---------------------------------------------------------
    "me_ai_anomaly_class": (
        "異常クラス統制語彙マスタ（ドラフト）。判定イベント・要因分類・見直し起票が参照する語彙。自由記述を分類キーに使わせないための土台。多言語名称（JA/EN/ID）を保持。",
        "Master kosakata terkendali kelas anomali (draf). Kosakata acuan event penilaian, klasifikasi faktor, dan pembukaan kasus review. Mencegah teks bebas dipakai sebagai kunci klasifikasi. Menyimpan nama multi-bahasa (JA/EN/ID)."),
    "me_ai_asset_registry": (
        "AI資産版数レジストリ（ドラフト）。エージェント/スキル/フック/モデル/理論値セットの版カタログ。eval合格→カナリア→本番の昇格管理台帳で、判断レコードの版数リンク先。",
        "Registri versi aset AI (draf). Katalog versi agent/skill/hook/model/set nilai teoretis. Buku besar promosi (lulus eval -> canary -> produksi) dan target tautan versi dari rekaman penilaian."),
    "te_ai_judgment_log": (
        "AI判断レコード（ドラフト）。Flow B 1実行=1行。判定イベント・特徴量スナップショット・LLM分析結果（immutable）と状態列（open→notified→…）を保持。hypertable（detected_at）。",
        "Rekaman penilaian AI (draf). 1 eksekusi Flow B = 1 baris. Menyimpan event penilaian, snapshot fitur, hasil analisis LLM (immutable) dan kolom status (open -> notified -> ...). Hypertable (detected_at)."),
    "te_ai_feedback_log": (
        "オペレーター結果入力ログ（ドラフト）。判断レコードに対する実結果（hit/false_positive等）・実施対応・効果の追記専用ログ。次の判断の教師データ。",
        "Log umpan balik operator (draf). Log append-only hasil aktual (hit/false_positive dsb), tindakan, dan efek terhadap rekaman penilaian. Data guru untuk penilaian berikutnya."),
    "te_ai_review_case": (
        "見直し案件管理（ドラフト）。誤報しきい値・抑制期限切れ・検出漏れ・LLM提案で起票される見直し案件の状態管理（detected→…→applied）。改訂対象は理論値セットまたはAI資産。",
        "Manajemen kasus review (draf). Pengelolaan status kasus review yang dibuka oleh ambang false-positive, kedaluwarsa penekanan, deteksi terlewat, atau usulan LLM (detected -> ... -> applied). Objek revisi: set nilai teoretis atau aset AI."),
    # --- proposal ----------------------------------------------------------
    "mm_m_std_time": (
        "標準値マスタ（提案）。品目×作業×工場×適用開始日をキーに、理論サイクルタイム（Ideal CT — OEE性能稼働率の分子）と標準工数（ST — OLE労働性能の分子）を保持。実績平均から自動更新しない（ZEVA原則4: 理論値基準）。",
        "Master nilai standar (usulan). Dengan kunci item x pekerjaan x plant x tanggal berlaku, menyimpan waktu siklus ideal (Ideal CT - pembilang performance OEE) dan waktu kerja standar (ST - pembilang performa tenaga kerja OLE). Tidak diperbarui otomatis dari rata-rata aktual (prinsip ZEVA 4: basis nilai teoretis)."),
    # --- PFE ---------------------------------------------------------------
    "t1_edge_machine_event": (
        "クラス①標準写像イベント（設計例）。設備状態遷移・出来高を t2 の遷移語彙のままエッジが記録し、ETL 1→2 が t2_machine_oper/work/alarm_hist へ写像する。ETL経路宣言（写像先＋遷移語彙）必須。カタログ登録必須（R3）。",
        "Event terpetakan standar kelas 1 (contoh desain). Edge mencatat transisi status mesin dan output memakai kosakata transisi t2 apa adanya; ETL 1->2 memetakannya ke t2_machine_oper/work/alarm_hist. Deklarasi jalur ETL (tabel tujuan + kosakata transisi) wajib. Registrasi katalog wajib (R3)."),
    "t1_ref_vibration": (
        "振動特徴量（クラス② local-only・アーキタイプA）。窓特徴量の時系列。t2 に計測系列の受け皿がないため PFS へ送らない。ローカルSPC前段判定と Flow B 調査の素材。hypertable（sampled_at）、retention 180日。新しい量目はチャネル台帳への追加で収容（テーブル新設ではない）。",
        "Fitur getaran (kelas 2 local-only, arketipe A). Deret waktu fitur jendela. Tidak dikirim ke PFS karena Tier-2 tidak punya wadah deret pengukuran. Bahan penilaian SPC lokal dan investigasi Flow B. Hypertable (sampled_at), retensi 180 hari. Besaran baru ditampung lewat registrasi channel, bukan tabel baru."),
    "t1_ref_waveform": (
        "生波形キャプチャ（クラス② local-only・アーキタイプC）。エンコード済みサンプルフレーム。データはエッジ外へ出ない — 到達手段は Edge MCP raw_waveform_query のみ。hypertable（captured_at）、retention 14日（必須）。",
        "Tangkapan gelombang mentah (kelas 2 local-only, arketipe C). Frame sampel terenkode. Data tidak keluar dari edge - satu-satunya akses adalah Edge MCP raw_waveform_query. Hypertable (captured_at), retensi 14 hari (wajib)."),
    "pfe_ops": (
        "エッジ内部運用スキーマ（クラス③）。チャネル台帳・判定イベントミラー・ETL検証結果・リネージリンクの4テーブル。Tier-1 ではないため中央カタログに登録せず、describe_local_data にも公開しない。監査列は簡略4列。",
        "Skema operasional internal edge (kelas 3). Empat tabel: registri channel, cermin event penilaian, hasil verifikasi ETL, tautan lineage. Bukan Tier-1 sehingga tidak didaftarkan ke katalog pusat dan tidak diekspos lewat describe_local_data. Kolom audit versi ringkas (4 kolom)."),
}

# concept-only rows for TOC (no sheet)
CONCEPT = [
    ("te_edge_health_log",
     ("エッジ死活監視履歴（構想）。最終サンプル時刻・キュー深度・エラーカウンタの履歴。",
      "Riwayat pemantauan liveness edge (konsep). Riwayat waktu sampel terakhir, kedalaman antrean, penghitung error.")),
    ("te_edge_config_log",
     ("エッジ設定配布履歴（構想）。設定版数・適用結果・ロールバック記録。",
      "Riwayat distribusi konfigurasi edge (konsep). Versi konfigurasi, hasil penerapan, catatan rollback.")),
]

# logical names for draft/hand tables: (ja, id) keyed (table, column)
LN = {
    ("me_ai_anomaly_class", "anomaly_class_code"): ("異常クラスコード", "Kode kelas anomali"),
    ("me_ai_anomaly_class", "plant_code"): ("プラントコード", "Kode plant"),
    ("me_ai_anomaly_class", "module"): ("モジュール", "Modul"),
    ("me_ai_anomaly_class", "name_ja"): ("名称（日本語）", "Nama (Jepang)"),
    ("me_ai_anomaly_class", "name_en"): ("名称（英語）", "Nama (Inggris)"),
    ("me_ai_anomaly_class", "name_id"): ("名称（インドネシア語）", "Nama (Indonesia)"),
    ("me_ai_anomaly_class", "description"): ("説明", "Deskripsi"),
    ("me_ai_anomaly_class", "is_active"): ("有効フラグ", "Flag aktif"),
    ("me_ai_asset_registry", "asset_id"): ("AI資産ID", "ID aset AI"),
    ("me_ai_asset_registry", "asset_kind"): ("資産種別", "Jenis aset"),
    ("me_ai_asset_registry", "asset_name"): ("資産名", "Nama aset"),
    ("me_ai_asset_registry", "asset_version"): ("資産バージョン", "Versi aset"),
    ("me_ai_asset_registry", "content_ref"): ("実体参照", "Referensi konten"),
    ("me_ai_asset_registry", "status"): ("状態", "Status"),
    ("me_ai_asset_registry", "eval_report_ref"): ("評価レポート参照", "Referensi laporan evaluasi"),
    ("me_ai_asset_registry", "promoted_at"): ("昇格日時", "Waktu promosi"),
    ("me_ai_asset_registry", "plant_code"): ("プラントコード", "Kode plant"),
    ("te_ai_judgment_log", "judgment_id"): ("判断ID", "ID penilaian"),
    ("te_ai_judgment_log", "event_id"): ("判定イベントID", "ID event penilaian"),
    ("te_ai_judgment_log", "detected_at"): ("検出日時", "Waktu deteksi"),
    ("te_ai_judgment_log", "target_edge_id"): ("対象エッジID", "ID edge target"),
    ("te_ai_judgment_log", "plant_code"): ("プラントコード", "Kode plant"),
    ("te_ai_judgment_log", "module"): ("モジュール", "Modul"),
    ("te_ai_judgment_log", "anomaly_class_code"): ("異常クラスコード", "Kode kelas anomali"),
    ("te_ai_judgment_log", "severity"): ("重要度", "Tingkat keparahan"),
    ("te_ai_judgment_log", "subject_axes"): ("4M軸", "Sumbu 4M"),
    ("te_ai_judgment_log", "feature_snapshot"): ("特徴量スナップショット", "Snapshot fitur"),
    ("te_ai_judgment_log", "theoretical_asset_id"): ("理論値資産ID", "ID aset nilai teoretis"),
    ("te_ai_judgment_log", "analysis_result"): ("分析結果", "Hasil analisis"),
    ("te_ai_judgment_log", "tool_call_log"): ("ツール呼び出しログ", "Log pemanggilan tool"),
    ("te_ai_judgment_log", "used_asset_ids"): ("使用資産ID群", "Daftar ID aset terpakai"),
    ("te_ai_judgment_log", "enrichment_status"): ("付加分析状態", "Status pengayaan"),
    ("te_ai_judgment_log", "similar_injected"): ("類似注入ID群", "Daftar ID serupa disuntikkan"),
    ("te_ai_judgment_log", "state"): ("状態", "Status"),
    ("te_ai_judgment_log", "state_reason"): ("状態理由", "Alasan status"),
    ("te_ai_judgment_log", "suppress_until"): ("抑制期限", "Batas penekanan"),
    ("te_ai_judgment_log", "resolved_class"): ("解決分類", "Klasifikasi penyelesaian"),
    ("te_ai_feedback_log", "feedback_id"): ("フィードバックID", "ID umpan balik"),
    ("te_ai_feedback_log", "judgment_id"): ("判断ID", "ID penilaian"),
    ("te_ai_feedback_log", "judgment_detected_at"): ("判断検出日時（非正規化）", "Waktu deteksi penilaian (denormalisasi)"),
    ("te_ai_feedback_log", "fed_back_at"): ("入力日時", "Waktu umpan balik"),
    ("te_ai_feedback_log", "plant_code"): ("プラントコード", "Kode plant"),
    ("te_ai_feedback_log", "verdict"): ("実結果判定", "Vonis hasil aktual"),
    ("te_ai_feedback_log", "action_taken"): ("実施対応", "Tindakan yang dilakukan"),
    ("te_ai_feedback_log", "effect"): ("効果", "Efek"),
    ("te_ai_feedback_log", "residual_risk"): ("残留リスク", "Risiko residu"),
    ("te_ai_feedback_log", "note"): ("備考", "Catatan"),
    ("te_ai_review_case", "review_id"): ("見直し案件ID", "ID kasus review"),
    ("te_ai_review_case", "opened_at"): ("起票日時", "Waktu pembukaan"),
    ("te_ai_review_case", "plant_code"): ("プラントコード", "Kode plant"),
    ("te_ai_review_case", "trigger_kind"): ("起票トリガー種別", "Jenis pemicu"),
    ("te_ai_review_case", "target_kind"): ("対象種別", "Jenis target"),
    ("te_ai_review_case", "target_asset_id"): ("対象資産ID", "ID aset target"),
    ("te_ai_review_case", "anomaly_class_code"): ("異常クラスコード", "Kode kelas anomali"),
    ("te_ai_review_case", "evidence_judgments"): ("根拠判断ID群", "Daftar ID penilaian bukti"),
    ("te_ai_review_case", "draft_summary"): ("下書き要約", "Ringkasan draf"),
    ("te_ai_review_case", "state"): ("状態", "Status"),
    ("te_ai_review_case", "state_reason"): ("状態理由", "Alasan status"),
    ("te_ai_review_case", "defer_until"): ("保留期限", "Batas penundaan"),
    ("te_ai_review_case", "applied_asset_id"): ("反映後資産ID", "ID aset hasil penerapan"),
}

# ID translations of draft inline remarks (fallback: keep JA)
RM_ID = {
    "例 'spc_run_up', 'tact_overrun'": "Contoh: 'spc_run_up', 'tact_overrun'",
    "'*' = 全社共通行を許す運用も可（要決定）": "'*' = baris umum seluruh perusahaan dimungkinkan (perlu keputusan)",
    "定義・判定の意味（教育にも使う）": "Definisi/makna penilaian (juga untuk edukasi)",
    "インドネシア語（追補予定）": "Bahasa Indonesia (akan dilengkapi)",
    "例 'waveform-analyst', 'qwen3-32b-q4'": "Contoh: 'waveform-analyst', 'qwen3-32b-q4'",
    "git tag / モデルダイジェスト / 理論値版": "Git tag / digest model / versi nilai teoretis",
    "git パス+コミット / Ollama digest 等の参照": "Referensi path git+commit / digest Ollama, dll",
    "昇格根拠の eval 結果参照": "Referensi hasil eval dasar promosi",
    "ZEVA-Engine 判定イベント（冪等キー）": "Event penilaian ZEVA-Engine (kunci idempoten)",
    "イベント検出時刻（hypertable 次元）": "Waktu deteksi event (dimensi hypertable)",
    "4M 軸（判明分のみ）": "Sumbu 4M (hanya yang diketahui)",
    "判定根拠の特徴量窓（理論値・偏差σ含む）": "Jendela fitur dasar penilaian (termasuk nilai teoretis & deviasi sigma)",
    "AnalysisResult スキーマ（withheld 含む）": "Skema AnalysisResult (termasuk withheld)",
    "ツール呼び出し列（数値引用検証の根拠）": "Deret pemanggilan tool (dasar verifikasi kutipan angka)",
    "使用資産版（要素存在性はトリガー検証 §0-6）": "Versi aset terpakai (eksistensi elemen diverifikasi trigger §0-6)",
    "注入した過去 judgment_id（静黙時は空）": "judgment_id lampau yang disuntikkan (kosong bila senyap)",
    "到来で自動再浮上（→ notified。ジョブ実行 §0-5）": "Muncul kembali otomatis saat jatuh tempo (-> notified; job §0-5)",
    "resolved の結果分類（統制語彙）": "Klasifikasi hasil untuk resolved (kosakata terkendali)",
    "参照先 hypertable の複合 PK に合わせた非正規化列（inbound FK の定番パターン）":
        "Kolom denormalisasi mengikuti PK komposit hypertable rujukan (pola baku inbound FK)",
    "実施した対応": "Tindakan yang dilakukan",
    "効果": "Efek",
    "残留リスク": "Risiko residu",
    "根拠 judgment_id 群（要素存在性はトリガー検証 §0-6）": "Kumpulan judgment_id bukti (eksistensi diverifikasi trigger §0-6)",
    "LLM 起票の下書き（添付物。状態は動かせない）": "Draf pembukaan oleh LLM (lampiran; tidak menggerakkan status)",
    "deferred 必須。到来で pending_review へ自動復帰": "Wajib saat deferred; kembali otomatis ke pending_review saat jatuh tempo",
    "applied 時: 改訂後の新版": "Saat applied: versi baru hasil revisi",
}


def audit8(lang_tables):
    """Extract the standard audit-8 column defs from mm_m_item of a parsed SQL."""
    src = lang_tables["mm_m_item"]["cols"]
    return [dict(c) for c in src if c["name"] in (
        "update_at", "update_user", "update_device", "update_pg",
        "create_at", "create_user", "create_device", "create_pg")]


def hand_tables(lang, aud):
    """Hand-encoded specs: mm_m_std_time (proposal) + PFE tables."""
    ja = lang == "ja"

    def col(name, typ, ln_, nn, logical_ja, logical_id, rem_ja="", rem_id="", default=""):
        return dict(name=name, type=typ, len=ln_, prec="", nn=nn, default=default,
                    logical=logical_ja if ja else logical_id,
                    remark=rem_ja if ja else rem_id)

    t = {}
    t["mm_m_std_time"] = dict(schema="pfs", pk_name="pk_mm_m_std_time",
        pk_cols="item_code, work_id, plant_code, valid_from",
        logical="標準値マスタ（理論CT・標準工数）" if ja else "Master nilai standar (CT ideal & waktu kerja standar)",
        remark="", cols=[
            col("item_code", "VARCHAR", "40", True, "品目コード（ＧＭＣ）", "Kode item (GMC)",
                "→ mm_m_item", "-> mm_m_item"),
            col("work_id", "VARCHAR", "6", True, "作業ＩＤ", "ID pekerjaan", "→ mm_m_work", "-> mm_m_work"),
            col("plant_code", "VARCHAR", "4", True, "プラントコード", "Kode plant"),
            col("valid_from", "DATE", "", True, "適用開始日", "Tanggal mulai berlaku",
                "改定履歴を保持（過去のOEEを当時の理論値で再現）", "Menyimpan riwayat revisi (OEE lampau dapat direproduksi)"),
            col("ideal_cycle_time_sec", "NUMERIC", "", False, "理論サイクルタイム", "Waktu siklus ideal",
                "秒/個。OEE性能稼働率の分子", "Detik/unit. Pembilang performance OEE"),
            col("std_labor_time_sec", "NUMERIC", "", False, "標準工数", "Waktu kerja standar",
                "人・秒/個。OLE労働性能の分子", "Orang·detik/unit. Pembilang performa tenaga kerja OLE"),
        ] + aud)
    t["t1_edge_machine_event"] = dict(schema="pfe", pk_name="(設計例: event_id)" if ja else "(contoh: event_id)",
        pk_cols="event_id",
        logical="設備状態遷移イベント（クラス①設計例）" if ja else "Event transisi status mesin (contoh desain kelas 1)",
        remark="", cols=[
            col("event_id", "UUID", "", True, "イベントＩＤ", "ID event",
                "ETLリネージのアドレス", "Alamat lineage ETL"),
            col("plant_code", "VARCHAR", "4", True, "プラントコード", "Kode plant"),
            col("occurred_at", "TIMESTAMPTZ", "", True, "発生日時", "Waktu kejadian"),
            col("transition", "VARCHAR", "35", True, "遷移", "Transisi",
                "写像先 t2 の遷移語彙をそのまま使う（例 'Start Operation'）",
                "Memakai kosakata transisi t2 tujuan apa adanya (mis. 'Start Operation')"),
            col("equipment_id", "VARCHAR", "20", False, "設備ＩＤ", "ID peralatan", "4M軸: 機械", "Sumbu 4M: mesin"),
            col("person_id", "VARCHAR", "20", False, "作業者ＩＤ", "ID pekerja", "4M軸: 人", "Sumbu 4M: orang"),
            col("material_id", "VARCHAR", "30", False, "材料ＩＤ", "ID material", "4M軸: モノ", "Sumbu 4M: material"),
            col("work_order_no", "VARCHAR", "15", False, "製造指示Ｎｏ", "No instruksi produksi"),
            col("qty", "NUMERIC", "", False, "出来高員数", "Jumlah output",
                "該当遷移のみ", "Hanya pada transisi terkait"),
            col("optional_data", "JSONB", "", False, "デバイス固有付帯情報", "Data opsional spesifik perangkat",
                "ETL境界を越えない", "Tidak melewati batas ETL"),
        ] + aud)
    t["t1_ref_vibration"] = dict(schema="pfe", pk_name="pk_t1_ref_vibration",
        pk_cols="sample_id, sampled_at",
        logical="振動特徴量（クラス②・アーキタイプＡ）" if ja else "Fitur getaran (kelas 2, arketipe A)",
        remark="", cols=[
            col("sample_id", "UUID", "", True, "サンプルＩＤ", "ID sampel",
                "ローカルアドレス（リネージなし）", "Alamat lokal (tanpa lineage)", default="gen_random_uuid()"),
            col("plant_code", "VARCHAR", "4", True, "プラントコード", "Kode plant"),
            col("sampled_at", "TIMESTAMPTZ", "", True, "サンプリング日時", "Waktu sampling",
                "hypertable 次元", "Dimensi hypertable"),
            col("equipment_id", "VARCHAR", "20", True, "設備ＩＤ", "ID peralatan"),
            col("person_id", "VARCHAR", "20", False, "作業者ＩＤ", "ID pekerja"),
            col("material_id", "VARCHAR", "30", False, "材料ＩＤ", "ID material"),
            col("channel_id", "VARCHAR", "40", True, "チャネルＩＤ", "ID channel",
                "list_channels で解決", "Diresolusi lewat list_channels"),
            col("feature_rms", "DOUBLE PRECISION", "", True, "ＲＭＳ特徴量", "Fitur RMS",
                "間引き窓", "Jendela desimasi"),
            col("feature_peak", "DOUBLE PRECISION", "", True, "ピーク特徴量", "Fitur puncak",
                "間引き窓", "Jendela desimasi"),
            col("window_ms", "INTEGER", "", True, "間引きウィンドウ長", "Panjang jendela desimasi", "ms", "ms"),
            col("optional_data", "JSONB", "", False, "機器固有オプション", "Opsi spesifik perangkat",
                "PFSへ転送しない", "Tidak dikirim ke PFS"),
        ] + aud)
    t["t1_ref_waveform"] = dict(schema="pfe", pk_name="pk_t1_ref_waveform",
        pk_cols="capture_id, captured_at",
        logical="生波形キャプチャ（クラス②・アーキタイプＣ）" if ja else "Tangkapan gelombang mentah (kelas 2, arketipe C)",
        remark="", cols=[
            col("capture_id", "UUID", "", True, "キャプチャＩＤ", "ID tangkapan",
                "ローカルアドレスのみ", "Hanya alamat lokal", default="gen_random_uuid()"),
            col("plant_code", "VARCHAR", "4", True, "プラントコード", "Kode plant"),
            col("channel_id", "VARCHAR", "40", True, "チャネルＩＤ", "ID channel"),
            col("captured_at", "TIMESTAMPTZ", "", True, "フレーム先頭サンプル時刻", "Waktu sampel awal frame",
                "サンプルNは captured_at + N/rate", "Sampel N = captured_at + N/rate"),
            col("sample_rate_hz", "INTEGER", "", True, "サンプリングレート", "Laju sampling", "Hz", "Hz"),
            col("unit", "VARCHAR", "16", True, "物理単位", "Satuan fisik", "例 m/s2", "Contoh: m/s2"),
            col("frame", "BYTEA", "", True, "サンプルフレーム", "Frame sampel",
                "生データ・エッジ外不出", "Data mentah, tidak keluar edge"),
            col("frame_encoding", "VARCHAR", "20", True, "フレームエンコーディング", "Enkode frame",
                "'f64le' = LE IEEE754 double", "'f64le' = LE IEEE754 double", default="'f64le'"),
            col("equipment_id", "VARCHAR", "20", True, "設備ＩＤ", "ID peralatan"),
        ] + aud)
    return t


PFE_OPS_ROWS = [  # (table, pk, ja, id)
    ("pfe_ops.channel", "(id)",
     "チャネル/センサー台帳。list_channels の裏付け。description は必須（デバイスを見たことがない読者向けに書く）",
     "Registri channel/sensor. Dasar list_channels. description wajib (ditulis untuk pembaca yang belum pernah melihat perangkatnya)"),
    ("pfe_ops.judgment_event", "(id)",
     "ZEVA-Engine 判定イベントのエッジ側ミラー。get_event_context / compute_4m_correlation の裏付け。severity・judgment_type・4M軸・inputs/refs JSONB",
     "Cermin event penilaian ZEVA-Engine di sisi edge. Dasar get_event_context / compute_4m_correlation. severity, judgment_type, sumbu 4M, inputs/refs JSONB"),
    ("pfe_ops.etl_run", "(run_id)",
     "ETL 1→2 実行検証結果。validate_etl_run の裏付け。is_idempotent・scanned_rows・diff JSONB",
     "Hasil verifikasi eksekusi ETL 1->2. Dasar validate_etl_run. is_idempotent, scanned_rows, diff JSONB"),
    ("pfe_ops.lineage_link", "(parent_id, child_id)",
     "Tier-2→Tier-1 リネージエッジ。trace_tier1_to_tier2 の裏付け。te_etl_*_log アドレッシングのミラー",
     "Edge lineage Tier-2 -> Tier-1. Dasar trace_tier1_to_tier2. Cermin pengalamatan te_etl_*_log"),
]

# TOC section ordering: (section title (ja, id), table names)
# split into PFS (central / Tier-2 side) and PFE (site / Tier-1 side) books
SECTIONS = [
    (("PFS ─ 製造マスタ（mm_m_*）", "PFS - Master manufaktur (mm_m_*)"),
     ["mm_m_item", "mm_m_process", "mm_m_work", "mm_m_workctr", "mm_m_work_station",
      "mm_m_work_resource", "mm_m_storage_area", "mm_m_storage_location"]),
    (("PFS ─ YMES連携（mm_ymes_* / tm_*）", "PFS - Integrasi YMES (mm_ymes_* / tm_*)"),
     ["mm_ymes_linkage_info", "mm_ymes_linkage_schedule", "tm_ymes_linkage_log"]),
    (("PFS ─ Tier-2 識別マスタ（m2_*・凍結）", "PFS - Master identifikasi Tier-2 (m2_*, dibekukan)"),
     ["m2_person_identification", "m2_material_identification", "m2_machine_identification", "m2_iot_location"]),
    (("PFS ─ Tier-2 ヒト履歴（t2_person_*・凍結）", "PFS - Riwayat orang Tier-2 (t2_person_*, dibekukan)"),
     ["t2_person_work_hist", "t2_person_nwork_hist", "t2_person_move_hist", "t2_person_time_ctrl_hist"]),
    (("PFS ─ Tier-2 モノ履歴（t2_material_*・凍結）", "PFS - Riwayat material Tier-2 (t2_material_*, dibekukan)"),
     ["t2_material_work_hist", "t2_material_process_hist", "t2_material_process_wait_hist",
      "t2_material_move_hist", "t2_material_storage_hist", "t2_material_storage_move_hist",
      "t2_material_storage_stay_hist", "t2_material_consu_hist"]),
    (("PFS ─ Tier-2 機械履歴（t2_machine_*・凍結）", "PFS - Riwayat mesin Tier-2 (t2_machine_*, dibekukan)"),
     ["t2_machine_oper_hist", "t2_machine_noper_hist", "t2_machine_work_hist",
      "t2_machine_nwork_oper_hist", "t2_machine_alarm_hist", "t2_machine_move_hist",
      "t2_machine_time_ctrl_hist"]),
    (("PFS ─ ETL・操作ログ（te_*）", "PFS - Log ETL & operasi (te_*)"),
     ["te_etl_person_log", "te_etl_material_log", "te_etl_machine_log", "te_oper_log"]),
    (("PFS ─ エッジ基盤・ユーザー（me_*）", "PFS - Platform edge & pengguna (me_*)"),
     ["me_edge_system", "me_edge_primary_data_table", "me_edge_primary_data_column",
      "me_user", "me_role", "me_user_role", "me_user_edge_system"]),
    (("PFS ─ ポータル（mp_*）", "PFS - Portal (mp_*)"),
     ["mp_portal_disp_cate", "mp_portal_disp_link"]),
    (("PFS ─ AIサービス（ドラフト）", "PFS - Layanan AI (draf)"),
     ["me_ai_anomaly_class", "me_ai_asset_registry", "te_ai_judgment_log",
      "te_ai_feedback_log", "te_ai_review_case"]),
    (("PFS ─ 標準値マスタ（提案）", "PFS - Master nilai standar (usulan)"),
     ["mm_m_std_time"]),
]

SECTIONS_PFE = [
    (("PFE ─ Tier-1 クラス①（標準写像イベント）", "PFE - Tier-1 kelas 1 (event terpetakan standar)"),
     ["t1_edge_machine_event"]),
    (("PFE ─ Tier-1 クラス②（ローカル専用詳細）", "PFE - Tier-1 kelas 2 (detail khusus lokal)"),
     ["t1_ref_vibration", "t1_ref_waveform"]),
    (("PFE ─ クラス③（エッジ内部運用）", "PFE - Kelas 3 (operasional internal edge)"),
     ["pfe_ops"]),
]

STATUS_OF = {}
for n in ["me_ai_anomaly_class", "me_ai_asset_registry", "te_ai_judgment_log",
          "te_ai_feedback_log", "te_ai_review_case"]:
    STATUS_OF[n] = "draft"
STATUS_OF["mm_m_std_time"] = "proposal"
STATUS_OF["t1_edge_machine_event"] = "example"
STATUS_OF["t1_ref_vibration"] = "ref"
STATUS_OF["t1_ref_waveform"] = "ref"
STATUS_OF["pfe_ops"] = "ref"


# ---------------------------------------------------------------- rendering --

THIN = Side(style="thin", color="999999")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
FILL_LBL = PatternFill("solid", fgColor="DCE6F1")
FILL_HDR = PatternFill("solid", fgColor="B8CCE4")
FILL_SEC = PatternFill("solid", fgColor="17375E")
FILL_ALT = PatternFill("solid", fgColor="F2F6FA")


def style_cell(c, font, bold=False, fill=None, wrap=False, center=False, color=None, size=None):
    c.font = Font(name=font, bold=bold, color=color or "000000", size=size or 10)
    if fill:
        c.fill = fill
    c.alignment = Alignment(wrap_text=wrap, vertical="center",
                            horizontal="center" if center else "left")
    return c


def write_table_sheet(wb, name, spec, lang, font, place, status_key, extra_note=""):
    lab = L[lang]
    li = 0 if lang == "ja" else 1
    ws = wb.create_sheet(title=name[:31])
    widths = [5, 30, 30, 18, 7, 7, 7, 10, 52]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    # meta block
    ws.merge_cells("A1:C1")
    style_cell(ws["A1"], font, bold=True, fill=FILL_LBL).value = lab["logical_tbl"]
    style_cell(ws["G1"], font, bold=True, fill=FILL_LBL).value = lab["author"]
    style_cell(ws["H1"], font).value = lab["author_v"]
    style_cell(ws["I1"], font, bold=True, fill=FILL_LBL).value = lab["made"]
    style_cell(ws["J1"], font).value = GEN_DATE
    link = style_cell(ws["K1"], font, color="0563C1")
    link.value = lab["to_toc"]
    link.hyperlink = f"#'{lab['toc']}'!A1"
    ws.merge_cells("A2:F2")
    style_cell(ws["A2"], font, bold=True, size=12).value = spec["logical"]
    ws.merge_cells("A3:C3")
    style_cell(ws["A3"], font, bold=True, fill=FILL_LBL).value = lab["phys"]
    style_cell(ws["D3"], font, bold=True, fill=FILL_LBL).value = lab["schema"]
    ws.merge_cells("A4:C4")
    style_cell(ws["A4"], font).value = name if name != "t1_edge_machine_event" else "t1_<edge>_machine_event"
    style_cell(ws["D4"], font).value = spec["schema"]
    style_cell(ws["A5"], font, bold=True, fill=FILL_LBL).value = lab["place"]
    style_cell(ws["B5"], font).value = place
    style_cell(ws["D5"], font, bold=True, fill=FILL_LBL).value = lab["cate"]
    ws.merge_cells("E5:F5")
    style_cell(ws["E5"], font).value = cat_of(name if name != "pfe_ops" else "t1")[li] or CAT["t1c3"][li] \
        if name == "pfe_ops" else cat_of(name)[li] or (CAT["t1c1"][li] if name == "t1_edge_machine_event" else CAT["t1c2"][li])
    style_cell(ws["G5"], font, bold=True, fill=FILL_LBL).value = lab["status"]
    ws.merge_cells("H5:K5")
    style_cell(ws["H5"], font).value = ST[status_key][li]
    style_cell(ws["A6"], font, bold=True, fill=FILL_LBL).value = lab["purpose"]
    ws.merge_cells("B6:K6")
    ptext = P.get(name, ("", ""))[li]
    if spec.get("remark"):
        ptext = (ptext + "\n" + spec["remark"]) if ptext else spec["remark"]
    if extra_note:
        ptext += ("\n" + extra_note)
    style_cell(ws["B6"], font, wrap=True).value = ptext
    ws.row_dimensions[6].height = max(30, 16 * (1 + len(ptext) // 70))
    # column table
    r = 8
    for i, h in enumerate(lab["hdr"], 1):
        c = ws.cell(row=r, column=i, value=h)
        style_cell(c, font, bold=True, fill=FILL_HDR, center=True, wrap=True)
        c.border = BORDER
    for idx, col in enumerate(spec["cols"], 1):
        r += 1
        remark = col["remark"]
        if col["default"]:
            d = "DEFAULT " + col["default"]
            remark = (remark + "\n" + d) if remark else d
        vals = [idx, col["logical"], col["name"], col["type"], col["len"], col["prec"],
                "Y" if col["nn"] else "", "", remark]
        pk_cols = [c.strip() for c in spec.get("pk_cols", "").split(",") if c.strip()]
        if col["name"] in pk_cols:
            vals[7] = pk_cols.index(col["name"]) + 1
        for i, v in enumerate(vals, 1):
            c = ws.cell(row=r, column=i, value=v)
            style_cell(c, font, wrap=(i in (2, 9)), center=(i in (1, 5, 6, 7, 8)))
            c.border = BORDER
            if idx % 2 == 0:
                c.fill = FILL_ALT
        n_lines = max(remark.count("\n") + 1 if remark else 1,
                      (len(remark) // 50 + 1) if remark else 1)
        if n_lines > 1:
            ws.row_dimensions[r].height = 13 * n_lines + 4
    # PK row
    r += 1
    style_cell(ws.cell(row=r, column=2, value=lab["pk"]), font, bold=True, fill=FILL_LBL).border = BORDER
    ws.merge_cells(start_row=r, start_column=3, end_row=r, end_column=5)
    style_cell(ws.cell(row=r, column=3, value=spec.get("pk_name", "")), font).border = BORDER
    ws.merge_cells(start_row=r, start_column=6, end_row=r, end_column=9)
    style_cell(ws.cell(row=r, column=6, value=spec.get("pk_cols", "")), font).border = BORDER
    ws.freeze_panes = "A9"
    ws.sheet_view.showGridLines = False
    return ws


def write_pfe_ops_sheet(wb, lang, font):
    lab = L[lang]
    li = 0 if lang == "ja" else 1
    ws = wb.create_sheet(title="pfe_ops")
    for i, w in enumerate([5, 28, 22, 90], 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.merge_cells("A1:B1")
    style_cell(ws["A1"], font, bold=True, fill=FILL_LBL).value = lab["logical_tbl"]
    link = style_cell(ws["D1"], font, color="0563C1")
    link.value = lab["to_toc"]
    link.hyperlink = f"#'{lab['toc']}'!A1"
    ws.merge_cells("A2:C2")
    style_cell(ws["A2"], font, bold=True, size=12).value = (
        "エッジ内部運用テーブル群（スキーマ pfe_ops・クラス③）" if lang == "ja"
        else "Tabel operasional internal edge (skema pfe_ops, kelas 3)")
    style_cell(ws["A3"], font, bold=True, fill=FILL_LBL).value = lab["place"]
    style_cell(ws["B3"], font).value = lab["pfe"]
    style_cell(ws["A4"], font, bold=True, fill=FILL_LBL).value = lab["status"]
    style_cell(ws["B4"], font).value = ST["ref"][1 if lang == "id" else 0]
    style_cell(ws["A5"], font, bold=True, fill=FILL_LBL).value = lab["purpose"]
    ws.merge_cells("B5:D5")
    style_cell(ws["B5"], font, wrap=True).value = P["pfe_ops"][li]
    ws.row_dimensions[5].height = 44
    hdr = (["No.", "テーブル", "主キー", "内容"] if lang == "ja"
           else ["No.", "Tabel", "Primary key", "Isi"])
    r = 7
    for i, h in enumerate(hdr, 1):
        c = ws.cell(row=r, column=i, value=h)
        style_cell(c, font, bold=True, fill=FILL_HDR, center=True)
        c.border = BORDER
    for idx, (tname, pk, ja_desc, id_desc) in enumerate(PFE_OPS_ROWS, 1):
        r += 1
        for i, v in enumerate([idx, tname, pk, ja_desc if lang == "ja" else id_desc], 1):
            c = ws.cell(row=r, column=i, value=v)
            style_cell(c, font, wrap=(i == 4), center=(i == 1))
            c.border = BORDER
        ws.row_dimensions[r].height = 40
    r += 2
    note = ("監査列は簡略版（update_at / update_user / create_at / create_user の4列）。"
            "クラス③は中央カタログ登録・describe_local_data 公開ともに禁止。" if lang == "ja" else
            "Kolom audit versi ringkas (4 kolom: update_at / update_user / create_at / create_user). "
            "Kelas 3 dilarang didaftarkan ke katalog pusat maupun diekspos lewat describe_local_data.")
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    style_cell(ws.cell(row=r, column=1, value=note), font, wrap=True)
    ws.sheet_view.showGridLines = False
    return ws


def build_workbook(lang, sql_tables, draft_tables, out_path, sections, title_key,
                   include_concept):
    lab = L[lang]
    li = 0 if lang == "ja" else 1
    font = "Meiryo UI" if lang == "ja" else "Arial"
    aud = audit8(sql_tables)
    hand = hand_tables(lang, aud)
    wb = openpyxl.Workbook()
    toc = wb.active
    toc.title = lab["toc"]
    for i, w in enumerate([5, 32, 34, 14, 9, 34, 26, 80], 1):
        toc.column_dimensions[get_column_letter(i)].width = w
    style_cell(toc["A1"], font, bold=True, size=14).value = lab[title_key]
    toc.merge_cells("A2:H2")
    style_cell(toc["A2"], font, wrap=True, color="555555").value = lab["subtitle"]
    r = 4
    for i, h in enumerate(lab["toc_hdr"], 1):
        c = toc.cell(row=r, column=i, value=h)
        style_cell(c, font, bold=True, fill=FILL_HDR, center=True)
        c.border = BORDER
    no = 0
    for (sec_titles, names) in sections:
        r += 1
        toc.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
        style_cell(toc.cell(row=r, column=1, value=sec_titles[li]), font,
                   bold=True, fill=FILL_SEC, color="FFFFFF")
        for name in names:
            no += 1
            if name in sql_tables:
                spec, status_key = sql_tables[name], (
                    "frozen" if name.startswith(("t2_", "m2_")) else "fixed")
            elif name in draft_tables:
                spec, status_key = dict(draft_tables[name]), STATUS_OF[name]
                # localize draft: logical names + audit8 append + remark translation
                for c in spec["cols"]:
                    c = c  # cols are shared dicts; copy below
                spec["cols"] = [dict(c) for c in draft_tables[name]["cols"]]
                for c in spec["cols"]:
                    ln_pair = LN.get((name, c["name"]))
                    if ln_pair:
                        c["logical"] = ln_pair[li]
                    if lang == "id" and c["remark"]:
                        c["remark"] = RM_ID.get(c["remark"], c["remark"])
                if draft_tables[name].get("audit8"):
                    spec["cols"] = spec["cols"] + [dict(a) for a in aud]
                spec["logical"] = P[name][li].split("。")[0].split(".")[0]
            elif name in hand:
                spec, status_key = hand[name], STATUS_OF[name]
            elif name == "pfe_ops":
                spec, status_key = None, "ref"
            else:
                continue
            is_pfe = name.startswith("t1_") or name == "pfe_ops"
            place = lab["pfe"] if is_pfe else lab["pfs"]
            if name == "pfe_ops":
                ws = write_pfe_ops_sheet(wb, lang, font)
                logical = ("エッジ内部運用（4テーブル）" if lang == "ja"
                           else "Operasional internal edge (4 tabel)")
                schema = "pfe_ops"
                cate = CAT["t1c3"][li]
            else:
                if name == "t1_edge_machine_event":
                    cate = CAT["t1c1"][li]
                elif name.startswith("t1_ref"):
                    cate = CAT["t1c2"][li]
                else:
                    cate = cat_of(name)[li]
                ws = write_table_sheet(wb, name, spec, lang, font, place, status_key)
                logical = spec["logical"]
                schema = spec["schema"]
            r += 1
            desc = P.get(name, ("", ""))[li]
            short = desc.split("。")[0] + "。" if lang == "ja" and "。" in desc else \
                (desc.split(". ")[0] + "." if ". " in desc else desc)
            row_vals = [no, name if name != "t1_edge_machine_event" else "t1_<edge>_machine_event",
                        logical, place, schema, cate, ST[status_key][li], short]
            for i, v in enumerate(row_vals, 1):
                c = toc.cell(row=r, column=i, value=v)
                style_cell(c, font, wrap=(i in (3, 8)), center=(i in (1, 4, 5)))
                c.border = BORDER
            link_c = toc.cell(row=r, column=2)
            link_c.hyperlink = f"#'{ws.title}'!A1"
            link_c.font = Font(name=font, color="0563C1", underline="single", size=10)
    # concept rows (no sheet) — PFS book only
    if include_concept:
        r += 1
        sec = ("構想（シート無し — pfe-fleet-management.md §6）" if lang == "ja"
               else "Konsep (tanpa sheet - pfe-fleet-management.md §6)")
        toc.merge_cells(start_row=r, start_column=1, end_row=r, end_column=8)
        style_cell(toc.cell(row=r, column=1, value=sec), font, bold=True, fill=FILL_SEC, color="FFFFFF")
        for name, descs in CONCEPT:
            no += 1
            r += 1
            vals = [no, name, "-", lab["pfs"], "pfs", CAT["me_edge"][li], ST["concept"][li], descs[li]]
            for i, v in enumerate(vals, 1):
                c = toc.cell(row=r, column=i, value=v)
                style_cell(c, font, wrap=(i == 8), center=(i in (1, 4, 5)))
                c.border = BORDER
    toc.freeze_panes = "A5"
    toc.sheet_view.showGridLines = False
    wb.save(out_path)
    return len(wb.sheetnames)


def main():
    sql_ja = parse_full_sql(SQL_JA)
    sql_id = parse_full_sql(SQL_ID)
    drafts = parse_draft_sql(AI_MD)
    assert len(sql_ja) == 47 and len(sql_id) == 47, (len(sql_ja), len(sql_id))
    assert len(drafts) == 5, list(drafts)
    missing = [n for (_t, names) in SECTIONS + SECTIONS_PFE for n in names
               if n not in sql_ja and n not in drafts
               and n not in ("mm_m_std_time", "t1_edge_machine_event",
                             "t1_ref_vibration", "t1_ref_waveform", "pfe_ops")]
    assert not missing, missing
    n1 = build_workbook("ja", sql_ja, drafts, OUT_JA_PFS, SECTIONS, "title_pfs", True)
    n2 = build_workbook("ja", sql_ja, drafts, OUT_JA_PFE, SECTIONS_PFE, "title_pfe", False)
    n3 = build_workbook("id", sql_id, drafts, OUT_ID_PFS, SECTIONS, "title_pfs", True)
    n4 = build_workbook("id", sql_id, drafts, OUT_ID_PFE, SECTIONS_PFE, "title_pfe", False)
    print("JA-PFS sheets:", n1, "->", OUT_JA_PFS)
    print("JA-PFE sheets:", n2, "->", OUT_JA_PFE)
    print("ID-PFS sheets:", n3, "->", OUT_ID_PFS)
    print("ID-PFE sheets:", n4, "->", OUT_ID_PFE)
    listed = {n for (_t, names) in SECTIONS for n in names}
    print("SQL tables not listed in TOC:", sorted(set(sql_ja) - listed))


if __name__ == "__main__":
    main()
