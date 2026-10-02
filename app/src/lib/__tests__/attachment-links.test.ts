import { describe, expect, it } from "vitest"
import {
  LINK_MIME,
  LINK_NAME_MAX,
  LINK_URL_MAX,
  isGitLink,
  isLinkEntry,
  linkCaption,
  normalizeLinkUrl,
  suggestLinkName,
} from "../attachment-links"

describe("normalizeLinkUrl", () => {
  it("accepts http and https URLs, trimmed", () => {
    expect(normalizeLinkUrl(" http://example.com ")).toBe("http://example.com/")
    expect(normalizeLinkUrl("https://gitlab.example.com/group/repo")).toBe("https://gitlab.example.com/group/repo")
  })

  it("rejects empty / whitespace-only input", () => {
    expect(normalizeLinkUrl("")).toBeNull()
    expect(normalizeLinkUrl("   ")).toBeNull()
  })

  it("rejects non-http(s) schemes (javascript:, data:, ftp:)", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull()
    expect(normalizeLinkUrl("data:text/html,<script>alert(1)</script>")).toBeNull()
    expect(normalizeLinkUrl("ftp://example.com/file")).toBeNull()
  })

  it("rejects malformed URLs", () => {
    expect(normalizeLinkUrl("not a url")).toBeNull()
    expect(normalizeLinkUrl("http://")).toBeNull()
  })

  it("rejects URLs longer than LINK_URL_MAX", () => {
    const long = "https://example.com/" + "a".repeat(LINK_URL_MAX)
    expect(normalizeLinkUrl(long)).toBeNull()
  })

  it("accepts a URL exactly at LINK_URL_MAX length", () => {
    const base = "https://example.com/"
    const padded = base + "a".repeat(LINK_URL_MAX - base.length)
    expect(padded.length).toBe(LINK_URL_MAX)
    expect(normalizeLinkUrl(padded)).toBe(padded)
  })
})

describe("isGitLink", () => {
  it("detects gitlab hosts case-insensitively", () => {
    expect(isGitLink("https://GitLab.example.com/group/repo")).toBe(true)
    expect(isGitLink("https://gitlab.com/group/repo")).toBe(true)
  })

  it("detects .git path suffix", () => {
    expect(isGitLink("https://example.com/group/repo.git")).toBe(true)
    expect(isGitLink("https://example.com/group/repo.git/")).toBe(true)
  })

  it("is false for an unrelated host/path", () => {
    expect(isGitLink("https://example.com/docs")).toBe(false)
  })

  it("is false for an invalid URL", () => {
    expect(isGitLink("not a url")).toBe(false)
  })
})

describe("suggestLinkName", () => {
  it("returns empty string for an invalid URL", () => {
    expect(suggestLinkName("javascript:alert(1)")).toBe("")
    expect(suggestLinkName("not a url")).toBe("")
  })

  it("derives group/repo from a GitLab-style path", () => {
    expect(suggestLinkName("https://gitlab.example.com/group/repo")).toBe("group/repo")
  })

  it("strips a GitLab '/-/tree/main' suffix", () => {
    expect(suggestLinkName("https://gitlab.example.com/group/repo/-/tree/main")).toBe("group/repo")
  })

  it("strips a GitLab '/-/merge_requests/…' suffix", () => {
    expect(suggestLinkName("https://gitlab.example.com/group/repo/-/merge_requests/12")).toBe("group/repo")
  })

  it("strips a trailing .git", () => {
    expect(suggestLinkName("https://gitlab.example.com/group/repo.git")).toBe("group/repo")
    expect(suggestLinkName("https://gitlab.example.com/group/repo.git/")).toBe("group/repo")
  })

  it("decodes encoded characters in the path", () => {
    expect(suggestLinkName("https://gitlab.example.com/group%2Fname/repo%20x")).toBe("group/name/repo x")
  })

  it("falls back to the hostname when the path is empty", () => {
    expect(suggestLinkName("https://example.com")).toBe("example.com")
    expect(suggestLinkName("https://example.com/")).toBe("example.com")
  })

  it("truncates the name to LINK_NAME_MAX characters", () => {
    const longGroup = "g".repeat(LINK_NAME_MAX + 50)
    const name = suggestLinkName(`https://gitlab.example.com/${longGroup}/repo`)
    expect(name.length).toBe(LINK_NAME_MAX)
  })

  it("falls back to the raw path segment when decoding fails", () => {
    // "%" not followed by valid hex escapes the way decodeURIComponent needs.
    expect(suggestLinkName("https://example.com/%E0%A4%A")).toBe("%E0%A4%A")
  })
})

describe("linkCaption", () => {
  it("formats host + path without the scheme", () => {
    expect(linkCaption("https://gitlab.example.com/group/repo")).toBe("gitlab.example.com/group/repo")
  })

  it("omits the path when it is just '/'", () => {
    expect(linkCaption("https://example.com/")).toBe("example.com")
  })

  it("returns the raw string for an invalid URL", () => {
    expect(linkCaption("not a url")).toBe("not a url")
  })
})

describe("isLinkEntry", () => {
  it("is true when mimeType is the link sentinel", () => {
    expect(isLinkEntry({ mimeType: LINK_MIME, linkUrl: null })).toBe(true)
  })

  it("is true when linkUrl is set regardless of mimeType", () => {
    expect(isLinkEntry({ mimeType: "application/pdf", linkUrl: "https://example.com" })).toBe(true)
  })

  it("is false for a regular file with no linkUrl", () => {
    expect(isLinkEntry({ mimeType: "application/pdf", linkUrl: null })).toBe(false)
    expect(isLinkEntry({ mimeType: "application/pdf" })).toBe(false)
  })
})
