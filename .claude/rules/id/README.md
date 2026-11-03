---
# Human-readable file — NEVER auto-attach to model context
# (CLAUDE.md §9 context budget). This file exists for human readers only.
paths:
  - "__i18n_reference_only__/**"
---

# Struktur Aturan (panduan bahasa Indonesia)

Pada model agen v3 (generasi Fable 5 / Opus 5) lapisan aturan disusun sebagai
berikut. Sumber resmi untuk model selalu versi bahasa Inggris — berkas ini
hanya panduan untuk pembaca manusia.

## Struktur

- **Selalu dimuat** (`@`-import di CLAUDE.md §9, setiap sesi):
  - `common/baseline.md` — hanya 4 konvensi dasar lintas bahasa
    (kosakata tingkat keparahan review / cakupan tes 80% / alias `model:` /
    riset sebelum implementasi)
  - `iotpf-agents-skills.md` — routing agen & skill per lapisan
  - `iotpf-git-workflow.md` — GitLab / MR / aturan branch & commit
  - `iotpf-self-improvement.md` — loop self-healing & self-improvement
- **Sesuai kebutuhan** (terpasang otomatis lewat frontmatter `paths:` hanya
  saat berkas terkait disentuh):
  - Per bahasa: `typescript/` `rust/` `python/` `web/` `shader/`
  - Per jenis pekerjaan: `iotpf-ui-workflow.md` (UI),
    `iotpf-pfs-data-model.md` (DB / ETL / Edge-MCP),
    `iotpf-edge-operations.md` (Edge / daemon),
    `iotpf-architecture-contracts.md` (`apps/**` / proto / compose)

## Prinsip desain v3

1. Tanpa contoh penggunaan — aturan disampaikan lewat struktur
   (kontrak, tabel keputusan, checklist)
2. Minimalkan konteks yang selalu dimuat — waktu pemuatan dikendalikan
   lewat `paths:` dan pemicu nama skill
3. Satu fakta satu tempat — tempat kedua hanya berupa pointer
4. Memori tidak ditulis ke CLAUDE.md — pemisahan peran Auto Memory /
   mistake-memory / changelog+ADR (CLAUDE.md §8)

10 berkas `common/` lama beserta terjemahan ja/id-nya dihapus pada 2026-08-13
(duplikasi, isi generik, dan arahan keliru berbasis GitHub). Riwayat lengkap
ada di `docs/agent-model-changelog.md`.
