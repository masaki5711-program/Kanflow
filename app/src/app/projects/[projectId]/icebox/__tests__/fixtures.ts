import type { IceboxItem, IceboxLists } from "../types"

export function iceboxItem(id: string, displayId: number, over: Partial<IceboxItem> = {}): IceboxItem {
  return {
    id,
    displayId,
    author: "Ann",
    request: `Request ${id}`,
    background: null,
    status: "unreviewed",
    assignedPo: null,
    poHearingMemo: null,
    poReviewMemo: null,
    rejectionReason: null,
    freezeReason: null,
    createdAt: "2026-01-01T00:00:00Z",
    attachments: [],
    ...over,
  }
}

export function iceboxLists(): IceboxLists {
  return {
    unreviewed: [
      iceboxItem("u1", 1, {
        request: "Dark mode please",
        background: "Eyes hurt",
        attachments: [
          { id: "img1", fileName: "a.png", originalName: "screen.png", fileSize: 2048, mimeType: "image/png" },
          { id: "vid1", fileName: "b.mp4", originalName: "a-very-long-video-file-name.mp4", fileSize: 3 * 1024 * 1024, mimeType: "video/mp4" },
          { id: "aud1", fileName: "c.mp3", originalName: "voice.mp3", fileSize: 500, mimeType: "audio/mpeg" },
          { id: "doc1", fileName: "d.pdf", originalName: "spec.pdf", fileSize: 100, mimeType: "application/pdf" },
        ],
      }),
    ],
    reviewed: [iceboxItem("r1", 2, { request: "Export CSV", status: "reviewed", poHearingMemo: "Heard", poReviewMemo: "Approved" })],
    completed: [],
    frozen: [iceboxItem("f1", 3, { request: "Old idea", status: "frozen", freezeReason: "Out of scope" })],
  }
}
