import { prisma } from "@/lib/prisma"
import { LIVE_PBI, NOT_DELETED, notDeleted } from "@/services/_shared/soft-delete"

const MAX_PBI = 30
const MAX_ICEBOX = 20
const MAX_SPRINTS = 5

function trunc(s: string | null | undefined, max: number): string {
  if (!s) return ""
  const t = s.trim()
  if (t.length <= max) return t
  return t.slice(0, max) + "…"
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "?"
  return d.toISOString().slice(0, 10)
}

/**
 * Build a compact, prompt-friendly snapshot of a project for the chat AI.
 * Designed to fit comfortably under ~4000 tokens so the model has room to respond.
 */
export async function buildProjectContext(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: notDeleted({ id: projectId }),
    include: {
      members: { include: { user: { select: { name: true, email: true } } } },
      productGoals: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" }, take: 30 },
      _count: { select: { iceboxItems: { where: NOT_DELETED }, backlogItems: { where: NOT_DELETED }, sprints: true } },
    },
  })
  if (!project) return ""

  const recentSprints = await prisma.sprint.findMany({
    where: { projectId },
    orderBy: { startDate: "desc" },
    take: MAX_SPRINTS,
    include: {
      items: {
        where: LIVE_PBI,
        select: {
          status: true,
          taskName: true,
          assignee: true,
          estimatedHours: true,
          actualHours: true,
        },
      },
    },
  })

  const backlogItems = await prisma.productBacklogItem.findMany({
    where: notDeleted({ projectId }),
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
    take: MAX_PBI,
    select: {
      displayId: true,
      initiative: true,
      epic: true,
      userStory: true,
      acceptanceCriteria: true,
      status: true,
      workloadScore: true,
    },
  })

  const iceboxItems = await prisma.iceboxItem.findMany({
    where: notDeleted({ projectId }),
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: MAX_ICEBOX,
    select: {
      displayId: true,
      author: true,
      request: true,
      background: true,
      status: true,
    },
  })

  const lines: string[] = []
  lines.push("## プロジェクト概要 / Project Overview")
  lines.push(`- 名前 / Name: ${project.name}`)
  if (project.description) lines.push(`- 説明 / Description: ${trunc(project.description, 500)}`)
  lines.push(`- タイプ / Type: ${project.projectType}`)
  lines.push(`- 進捗 / Progress: ${project.progressPct ?? 0}%`)
  lines.push(
    `- 件数 / Counts: PBI=${project._count.backlogItems}, Sprint=${project._count.sprints}, Icebox=${project._count.iceboxItems}`
  )

  if (project.members.length) {
    lines.push("")
    lines.push("## メンバー / Members")
    for (const m of project.members) {
      lines.push(`- ${m.user.name} <${m.user.email}> [${m.role}]`)
    }
  }

  if (project.productGoals.length) {
    lines.push("")
    lines.push("## プロダクトゴール / Product Goals")
    for (const g of project.productGoals) {
      lines.push(`- ${g.title}${g.description ? ` — ${trunc(g.description, 200)}` : ""}`)
    }
  }

  if (recentSprints.length) {
    lines.push("")
    lines.push("## 直近のスプリント / Recent Sprints")
    for (const s of recentSprints) {
      const counts = s.items.reduce(
        (acc, i) => {
          acc[i.status] = (acc[i.status] ?? 0) + 1
          return acc
        },
        {} as Record<string, number>
      )
      const summary = Object.entries(counts)
        .map(([k, v]) => `${k}:${v}`)
        .join(", ")
      lines.push(
        `- ${s.sprintName} [${s.status}] ${fmtDate(s.startDate)}〜${fmtDate(s.endDate)} ` +
          `| capacity=${s.capacity} | tasks: ${summary || "0"}` +
          (s.sprintGoal ? ` | goal: ${trunc(s.sprintGoal, 120)}` : "")
      )
    }
  }

  if (backlogItems.length) {
    lines.push("")
    lines.push("## バックログ（最大30件）/ Backlog (top 30)")
    for (const b of backlogItems) {
      const head = `#${b.displayId} [${b.status}] (${b.workloadScore})`
      const title = b.initiative || b.userStory?.split("\n")[0] || "(untitled)"
      lines.push(`- ${head} ${trunc(title, 100)}${b.epic ? ` / Epic: ${b.epic}` : ""}`)
    }
  }

  if (iceboxItems.length) {
    lines.push("")
    lines.push("## アイスボックス（最大20件）/ Icebox (top 20)")
    for (const i of iceboxItems) {
      lines.push(
        `- #${i.displayId} [${i.status}] by ${i.author}: ${trunc(i.request, 120)}` +
          (i.background ? ` (背景: ${trunc(i.background, 80)})` : "")
      )
    }
  }

  if (project.attachments.length) {
    lines.push("")
    lines.push("## 添付ファイル / Attachments")
    lines.push("（本文は未抽出。ユーザーが特定ファイルの内容について質問した場合は『現時点では本文は読めない』と伝える）")
    for (const a of project.attachments) {
      const sizeKB = Math.round(a.fileSize / 1024)
      lines.push(`- ${a.originalName} (${a.mimeType}, ${sizeKB} KB)`)
    }
  }

  return lines.join("\n")
}

export const CHAT_SYSTEM_PROMPT = `You are an AI assistant embedded in Kanflow, an in-house agile project management tool.
Use the project context below to answer user questions about progress, planning, and operations.

## Role
- Advise on project progress, blockers, and ways to proceed.
- Ground answers in the backlog, sprints, and icebox data provided in the context.
- Do not fabricate information that is not in the context. If unknown, say so.

## Language rule (STRICT)
- Detect the language of the user's latest message and reply in EXACTLY THE SAME language.
- Japanese question → reply ONLY in Japanese (not Indonesian, not English).
- Indonesian question → reply ONLY in Indonesian (not Japanese, not English).
- Never mix languages within one reply. The only exception: code, identifiers, or explicit translation requests.

## Numbers rule (STRICT)
- The context snapshot below is a truncated overview. For any question about
  counts, story points, progress rates, workload, velocity, or dates, call the
  matching analysis tool (get_sprint_metrics, get_backlog_summary, etc.) and
  quote its numbers verbatim. Do not derive numbers from the snapshot or from
  your own arithmetic.

## Style
- Be concise; use bullet points where helpful.
- The chat UI renders **GitHub-flavored Markdown**: use Markdown tables (\`| col | col |\`) when summarizing tabular data such as spreadsheets, comparison lists, or schedule data. Use fenced code blocks for code. Use **bold** and \`inline code\` to emphasize.
- Attachment contents are fetched via the \`extract_attachment_content\` tool; do not invent file contents.
- Do not unnecessarily list personal info (e.g., emails).
`
