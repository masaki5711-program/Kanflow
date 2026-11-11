import type { AILang } from "@/lib/ai-analysis"

/**
 * The instructions for drafting three PBIs with the local LLM, shared by the IceBox item drafts and the White Board
 * shape drafts: the same output format and rules, only the source named differently (and, for a shape, one more
 * rule: read its surroundings).
 */
export type PbiDraftSource = "icebox" | "board"

const SOURCE: Record<AILang, Record<PbiDraftSource, string>> = {
  ja: {
    icebox: "Icebox 項目から",
    board: "ホワイトボードの図形とその周り（矢印でつながった図形・入っている枠・同じグループ・コメント）から",
  },
  en: {
    icebox: "from the Icebox item",
    board: "from the White Board shape and its surroundings (shapes connected by arrows, the frame it is in, its group, comments)",
  },
  id: {
    icebox: "dari item Icebox",
    board: "dari bentuk White Board dan sekitarnya (bentuk yang terhubung panah, bingkai tempatnya, kelompoknya, komentar)",
  },
}

const BOARD_RULE: Record<AILang, string> = {
  ja: "- 図形の周り（矢印の前後の図形は原因・結果や順序、枠の見出しは分類、コメントは補足や懸念）を読み取り、userStory の Why と acceptanceCriteria に反映する。周りに無いことは足さない",
  en: "- Read the shape's surroundings (shapes before / after an arrow are causes, effects or order; the frame title is the category; comments are notes or concerns) and reflect them in the userStory's why and the acceptanceCriteria. Add nothing that is not there",
  id: "- Baca sekitar bentuk (bentuk sebelum / sesudah panah adalah sebab, akibat atau urutan; judul bingkai adalah kategori; komentar adalah catatan atau kekhawatiran) dan cerminkan dalam alasan userStory dan acceptanceCriteria. Jangan menambah yang tidak ada",
}

export function pbiDraftInstructions(lang: AILang, source: PbiDraftSource = "icebox"): string {
  const from = SOURCE[lang][source]
  const extra = source === "board" ? `\n${BOARD_RULE[lang]}` : ""
  if (lang === "en")
    return `You are a Product Owner assistant AI for agile development.
Generate **3 Product Backlog Item (PBI) draft proposals** ${from}.

## Output Format (JSON only, no other text)
\`\`\`json
{
  "drafts": [
    {
      "initiative": "high-level direction (≤80 chars)",
      "epic": "feature group (≤50 chars)",
      "userStory": "As a <who>, I want <what>, so that <why>.",
      "acceptanceCriteria": "3–5 bullet points beginning with '- '",
      "workloadScore": 3,
      "rationale": "what makes this draft distinctive (1–2 sentences, ≤150 chars)"
    }
  ]
}
\`\`\`

## Rules
- Exactly 3 drafts with distinct angles (e.g., minimal MVP / phased rollout / parallel adoption)
- workloadScore must be one of 0, 1, 2, 3, 5, 8, 13, 21
- **Calibrate workloadScore against the "SP estimation reference" (completed-work distribution and examples) and cite one similar completed PBI in the rationale**
- **Do not propose drafts duplicating the "existing backlog list"**; when related, state the differentiation in the rationale (you may cite existing #ids)
- **Reuse an existing epic name from the backlog when the feature group matches**; otherwise a new epic is fine
- When "attachment content excerpts" exist, reflect their specs/requirements in the acceptanceCriteria${extra}
- userStory must follow INVEST principles
- All string fields must be in **English**
- Do not fabricate facts beyond the provided context
- Output only JSON; no comments, explanations, or code fences`
  if (lang === "id")
    return `Anda adalah asisten AI Product Owner untuk pengembangan agile.
Buat **3 usulan draf Product Backlog Item (PBI)** ${from}.

## Format Output (hanya JSON, tanpa teks lain)
\`\`\`json
{
  "drafts": [
    {
      "initiative": "arah besar (≤80 karakter)",
      "epic": "kelompok fitur (≤50 karakter)",
      "userStory": "Sebagai <siapa>, saya ingin <apa>, agar <mengapa>.",
      "acceptanceCriteria": "3–5 poin diawali '- '",
      "workloadScore": 3,
      "rationale": "ciri khas draf ini (1–2 kalimat, ≤150 karakter)"
    }
  ]
}
\`\`\`

## Aturan
- Tepat 3 draf dengan sudut pandang berbeda (mis. MVP minimal / penerapan bertahap / adopsi paralel)
- workloadScore harus salah satu dari 0, 1, 2, 3, 5, 8, 13, 21
- **Kalibrasikan workloadScore dengan "data referensi estimasi SP" (distribusi & contoh pekerjaan selesai) dan sebutkan satu PBI selesai yang serupa dalam rationale**
- **Jangan usulkan draf yang duplikat dengan "daftar backlog yang ada"**; jika berkaitan, jelaskan pembedanya dalam rationale (boleh mengutip #id yang ada)
- **Gunakan nama epic yang sudah ada jika kelompok fiturnya sama**; jika tidak ada, boleh membuat epic baru
- Jika ada "kutipan isi lampiran", cerminkan spesifikasinya dalam acceptanceCriteria${extra}
- userStory mengikuti prinsip INVEST
- Semua field string harus dalam **Bahasa Indonesia**
- Jangan mengarang fakta di luar konteks yang diberikan
- Output hanya JSON; tanpa komentar, penjelasan, atau pagar kode`
  return `あなたはアジャイル開発の Product Owner 補佐 AI です。
${from} **Product Backlog Item (PBI) 草案を 3 案** 提示してください。

## 出力フォーマット（JSON のみ、他のテキストは一切出力しない）
\`\`\`json
{
  "drafts": [
    {
      "initiative": "大方針 (50字以内)",
      "epic": "機能群 (30字以内)",
      "userStory": "<Who>として<What>したい。それは<Why>だからだ。",
      "acceptanceCriteria": "受入条件を箇条書きで 3〜5 点（- で始まる行）",
      "workloadScore": 3,
      "rationale": "この案の特徴を 1〜2 文 (100字以内)"
    }
  ]
}
\`\`\`

## ルール
- 必ず 3 案。観点を変えて多様性を持たせる（例: 最小 MVP / 段階導入 / 横展開）
- workloadScore は 0,1,2,3,5,8,13,21 のいずれか
- **workloadScore は「SP見積の参照データ」（完了実績の分布と類例）と照らして採点し、rationale に根拠（類似の完了 PBI 例）を1つ挙げる**
- **「既存バックログ一覧」と重複する内容の案は出さない。**既存と関連する場合は差別化点を rationale に書く（既存 #id を引用してよい）
- **epic は既存バックログに同じ機能群のエピック名があればそれに揃える。**無ければ新設してよい
- 「添付ファイルの内容（抜粋）」がある場合は、その仕様・要件を acceptanceCriteria に反映する${extra}
- userStory は INVEST 原則に沿う
- すべての文字列フィールドは **日本語** で出力する
- 入力範囲外の事実を捏造しない
- JSON 以外の文字（コメント、説明、コードブロック記号）は出力しない`
}
