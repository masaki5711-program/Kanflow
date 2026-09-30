# =====================================================================
#  Kanflow AI Monitor — ローカルAIの動きをリアルタイム表示するデモ用コンソール
#  起動は start-ai-monitor.bat から（UTF-8コードページとウィンドウ設定込み）。
#  アプリサーバーが書き出す D:\APP\Kanflow\ai-activity.log を tail する。
#  ※このファイルは UTF-8 (BOM付き) で保存すること — PS5.1 の日本語対策。
# =====================================================================

$LogPath   = "D:\APP\Kanflow\ai-activity.log"
$OllamaUrl = "http://127.0.0.1:11434"

$Host.UI.RawUI.WindowTitle = "Kanflow AI Monitor - LIVE"

function Write-Header {
    Write-Host ""
    Write-Host "  =====================================================================" -ForegroundColor DarkCyan
    Write-Host "    KANFLOW AI MONITOR ― ローカルLLM ライブ実況" -ForegroundColor Cyan
    Write-Host "    （AIが裏側で何をしているかをリアルタイム表示）" -ForegroundColor DarkGray
    Write-Host "  =====================================================================" -ForegroundColor DarkCyan

    # Ollama 常駐モデルの状態
    try {
        $ps = Invoke-RestMethod "$OllamaUrl/api/ps" -TimeoutSec 3
        if ($ps.models -and $ps.models.Count -gt 0) {
            foreach ($m in $ps.models) {
                $vram = [math]::Round($m.size_vram / 1GB, 1)
                Write-Host ("    AIエンジン : {0}  (VRAM {1} GB 常駐中)" -f $m.name, $vram) -ForegroundColor Green
            }
        } else {
            Write-Host "    AIエンジン : Ollama 稼働中（モデルは初回呼び出し時にロード）" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "    AIエンジン : Ollama に接続できません ($OllamaUrl)" -ForegroundColor Red
    }
    Write-Host ("    監視ログ   : {0}" -f $LogPath) -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "    [凡例]" -ForegroundColor DarkGray
    Write-Host "      [質問] ユーザーの質問を受信   " -ForegroundColor Magenta -NoNewline
    Write-Host "[注入] プロジェクト情報をAIへ" -ForegroundColor DarkGray
    Write-Host "      [思考] AIモデルが推論中       " -ForegroundColor Cyan -NoNewline
    Write-Host "[道具] AIの判断で分析スクリプト実行" -ForegroundColor Yellow
    Write-Host "      [結果] 分析結果をAIへ返却     " -ForegroundColor Green -NoNewline
    Write-Host "[生成] 回答文を生成中" -ForegroundColor Gray
    Write-Host "      [完了] 回答完了" -ForegroundColor White
    Write-Host ""
    Write-Host "  ---------------------------------------------------------------------" -ForegroundColor DarkCyan
    Write-Host "   Kanflow のチャットや AI ボタンを使うと、ここに動きが流れます…" -ForegroundColor DarkGray
    Write-Host "  ---------------------------------------------------------------------" -ForegroundColor DarkCyan
    Write-Host ""
}

# イベント → 表示タグ・色 の対応表
$EventMap = @{
    "CHAT_START"    = @{ Tag = "[質問]"; Color = "Magenta" }
    "CONTEXT"       = @{ Tag = "[注入]"; Color = "DarkGray" }
    "LLM_TURN"      = @{ Tag = "[思考]"; Color = "Cyan" }
    "LLM_FIRST_TOK" = @{ Tag = "[思考]"; Color = "Cyan" }
    "LLM_OUTPUT"    = @{ Tag = "[生成]"; Color = "Gray" }
    "TOOL_CALL"     = @{ Tag = "[道具]"; Color = "Yellow" }
    "TOOL_RESULT"   = @{ Tag = "[結果]"; Color = "Green" }
    "CHAT_DONE"     = @{ Tag = "[完了]"; Color = "White" }
    "CHAT_LIMIT"    = @{ Tag = "[警告]"; Color = "Red" }
    "CHAT_ERROR"    = @{ Tag = "[異常]"; Color = "Red" }
    "ANALYSIS"      = @{ Tag = "[思考]"; Color = "Cyan" }
    "ANALYSIS_DONE" = @{ Tag = "[完了]"; Color = "White" }
    "VIZ_CHART"     = @{ Tag = "[図表]"; Color = "DarkYellow" }
    "VIZ_TABLE"     = @{ Tag = "[図表]"; Color = "DarkYellow" }
    "TRANSLATE"     = @{ Tag = "[翻訳]"; Color = "DarkCyan" }
    "TRANSLATE_DONE"= @{ Tag = "[完了]"; Color = "White" }
    "SURVEIL"       = @{ Tag = "[監視]"; Color = "DarkGreen" }
    "AGENT_START"   = @{ Tag = "[自律]"; Color = "Magenta" }
    "AGENT_DONE"    = @{ Tag = "[完了]"; Color = "White" }
    "REPORT_SAVED"  = @{ Tag = "[保存]"; Color = "Green" }
}

if (-not (Test-Path $LogPath)) {
    try { New-Item -ItemType File -Path $LogPath -Force | Out-Null } catch {}
}

Write-Header

# 永続 tail。-Tail 0 = 起動後の新規行のみ表示（デモをクリーンに開始できる）
Get-Content -Path $LogPath -Tail 0 -Wait -Encoding UTF8 | ForEach-Object {
    $line = $_
    if (-not $line) { return }
    $parts = $line -split " \| ", 3
    if ($parts.Count -lt 3) {
        Write-Host ("   " + $line) -ForegroundColor DarkGray
        return
    }
    $time   = $parts[0]
    $event  = $parts[1].Trim()
    $detail = $parts[2]

    $meta = $EventMap[$event]
    if (-not $meta) { $meta = @{ Tag = "[　　]"; Color = "Gray" } }

    # 質問ごとに区切り線を入れて見やすく
    if ($event -eq "CHAT_START") {
        Write-Host ""
        Write-Host "  ---------------------------------------------------------------------" -ForegroundColor DarkCyan
    }

    Write-Host ("   {0} " -f $time) -ForegroundColor DarkGray -NoNewline
    Write-Host ("{0} " -f $meta.Tag) -ForegroundColor $meta.Color -NoNewline
    Write-Host $detail -ForegroundColor $meta.Color

    if ($event -eq "CHAT_DONE" -or $event -eq "ANALYSIS_DONE") {
        Write-Host "  ---------------------------------------------------------------------" -ForegroundColor DarkCyan
    }
}
