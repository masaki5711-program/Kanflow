# GitStation への依頼: 代理実行（S1 / S2）— Kanflow の K4（F-36、MR の承認）のため

2026-11-05、Kanflow v2 のセッションから GitStation のセッションへの依頼。GitStation のリポジトリは編集せず、ここに書く
（K3 のときの `gitstation-contract-proposal.md` と同じ扱い）。

## なぜ要るか

計画 11 の K4（F-36）: Kanflow の PBI の画面と「自分のタスク」から、その PBI の MR を **承認 / 承認の取り消し** できるようにする
（技術者でない承認者が Kanflow から承認する。02 F-36）。GitStation では **押した本人として** `authorize()` が判定し、監査に
「kanflow（○○さんの代理）」と残す。承認の規則（人数・条件・保護ブランチ）は GitStation が持ち、Kanflow は表示と操作だけ。

GitStation の今（main `b7cd7ca`、2026-11-05 時点）:

- MR の承認の API はある: `POST /api/v1/projects/{id}/merge-requests/{iid}/approve`、`…/unapprove`、`GET …/approvals`、
  `…/approval-rules`。
- 代理実行は **まだ無い**。連携のイベントの履歴（I1c）は `Forge-Act-As` の付いた要求を拒否するだけ（`act_as_refused`）。
  ADR-0025（MR S1）も、実装（S2）も無い。

したがって K4 は S1・S2 を待つ。Kanflow だけで先に作れる部分（承認数の表示）は、開発状況の API（I1d）が来てから作る。

## Kanflow が S1 で決めてほしいこと（計画 11 §3.5 の案 B を前提に）

| # | 決めること | Kanflow の希望 | 理由 |
|---|---|---|---|
| 1 | 相手の指し方（`Forge-Act-As` の値） | GitStation の利用者 ID。無ければ社員番号（`employee:<番号>`） | 02 §5.3 の改訂（メールでは指さない）。Kanflow は `User.employeeNumber` を持つ。Kanflow から GitStation の利用者 ID を引く道が要るなら、それも |
| 2 | スコープ | 連携のサービスアカウントに `act_as`。代理で使える Action の許可リストは **承認・承認の取り消しだけ**から始める（読み取りは代理でなく連携の範囲で足りる） | 小さく始める |
| 3 | 本人の確認（主張） | GitStation の確認の画面を Kanflow が **新しいタブ**で開き（承認する MR・版の SHA・操作を表示）、本人が押すと 5 分・1 回限りの主張ができる。Kanflow はそれを **受け取り方が決まった形**で受け取り、承認の要求に付ける | 案 B。受け取り方（戻り先の URL に付ける / Kanflow が問い合わせる）を S1 で決めてほしい。戻り先は Kanflow の許可した URL だけ |
| 4 | 主張が結びつくもの | メソッド + パス + MR の版の SHA（02 §5.3 のとおり） | 別の MR・別の版への流用を防ぐ |
| 5 | 失敗のコード | 主張なし・期限切れ・使用済み・SHA の不一致・本人に権限なし・代理の許可外、をそれぞれ別の `error_code` で（利用者に見せる文は Kanflow が ja / en / id で出す） | Kanflow が「もう一度確認してください」と「この MR は承認できません」を分けて案内するため |
| 6 | 監査 | `actor_via_id`（サービスアカウント）・`act_as_claimed`・`via_assertion_id` を残す（ADR-0016 で予約済みの列） | 02 §5.3 |
| 7 | 本人がまだ GitStation にサインインしたことが無い | 確認の画面で SSO に回して、そのまま確認へ | 技術者でない承認者は GitStation を使っていないことが多い |

## Kanflow 側でやること（S2 の後、K4）

- PBI の画面と「自分のタスク」の MR の行に「承認」「承認を取り消す」。権限が無い人にはボタンを出さず、理由を出す。
- 押す → GitStation の確認の画面を開く → 主張を受け取る → 代理で承認の API を呼ぶ → 結果と承認数を表示。二重押しを防ぐ。
- 試験（計画 11 の K4 の行）: 主張なしの送信は拒否、権限の無い人にはボタンを出さない、二重押し。評価役は `typescript-reviewer`・
  `security-reviewer`・`a11y-architect`。

## 期日の感覚

Kanflow v2 は 2026-11-05 から本番（:3000）で動いている。K4 は v2 の M3 で最後の Kanflow 側の段。GitStation の I1d（開発状況の
API）と S1 / S2 のどちらを先にするかは、GitStation のセッションで決めてよい（Kanflow はどちらでも先に来たものから作る）。
