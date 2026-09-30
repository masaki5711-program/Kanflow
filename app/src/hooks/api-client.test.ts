import { afterEach, describe, expect, it, vi } from "vitest"
import { getTranslations } from "@/lib/i18n"
import { API_ERROR_CODES } from "@/services/_shared/error-codes"
import { API_ERROR_MESSAGE_KEYS } from "@/lib/i18n/api-errors"
import {
  ApiError,
  apiFetch,
  isAbortError,
  localizeApiError,
  parseErrorMessage,
  setApiErrorLanguage,
} from "./api-client"

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  setApiErrorLanguage(null)
})

describe("parseErrorMessage", () => {
  it.each([
    [{ error: "PBIが見つかりません" }, "PBIが見つかりません"],
    [{ message: "Forbidden project" }, "Forbidden project"],
    [{ error: { message: "nested" } }, "nested"],
    [{ errors: [{ message: "first" }, { message: "second" }] }, "first"],
    [{ errors: ["plain"] }, "plain"],
    ["plain text body", "plain text body"],
  ])("extracts the message from %j", (body, expected) => {
    expect(parseErrorMessage(body, 400)).toBe(expected)
  })

  it("falls back to the HTTP status for unknown shapes", () => {
    expect(parseErrorMessage({ foo: 1 }, 500, "Internal Server Error")).toBe("HTTP 500 Internal Server Error")
    expect(parseErrorMessage(undefined, 404)).toBe("HTTP 404")
  })

  it("ignores HTML error pages", () => {
    expect(parseErrorMessage("<html>Bad gateway</html>", 502, "Bad Gateway")).toBe("HTTP 502 Bad Gateway")
  })

  it("ignores blank error strings", () => {
    expect(parseErrorMessage({ error: "  ", message: "real" }, 400)).toBe("real")
  })
})

describe("apiFetch", () => {
  it("returns parsed JSON on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ id: "p1" })))
    await expect(apiFetch<{ id: string }>("/api/x")).resolves.toEqual({ id: "p1" })
  })

  it("serialises `json` with a JSON content type", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }))
    vi.stubGlobal("fetch", fetchMock)
    await apiFetch("/api/x", { method: "POST", json: { title: "t" } })
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.body).toBe(JSON.stringify({ title: "t" }))
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json")
  })

  it("throws ApiError with the server message and status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "権限がありません", code: "FORBIDDEN" }, { status: 403 })))
    const err = await apiFetch("/api/x").catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toBe("権限がありません")
    expect((err as ApiError).status).toBe(403)
    expect((err as ApiError).code).toBe("FORBIDDEN")
  })

  it("resolves undefined for 204 No Content", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })))
    await expect(apiFetch("/api/x", { method: "DELETE" })).resolves.toBeUndefined()
  })

  it("maps network failures to ApiError status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(0)
    expect(err.isNetworkError).toBe(true)
  })

  it("re-throws AbortError untouched", async () => {
    const abort = new DOMException("aborted", "AbortError")
    vi.stubGlobal("fetch", vi.fn(async () => { throw abort }))
    const err = await apiFetch("/api/x").catch((e: unknown) => e)
    expect(err).toBe(abort)
    expect(isAbortError(err)).toBe(true)
  })

  it("wraps parse failures in ApiError INVALID_RESPONSE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ id: 1 })))
    const parse = () => {
      throw new Error("id must be a string")
    }
    const err = (await apiFetch("/api/x", { parse }).catch((e: unknown) => e)) as ApiError
    expect(err.code).toBe("INVALID_RESPONSE")
    expect(err.message).toBe("id must be a string")
  })
})

describe("localizeApiError", () => {
  const ja = getTranslations("ja")
  const id = getTranslations("id")
  const en = getTranslations("en")

  it("maps a known code to the message of the given language", () => {
    const err = new ApiError("進行中または計画中のスプリントが既にあります", 409, undefined, "SPRINT_ACTIVE_EXISTS")
    expect(localizeApiError(err, id)).toBe(id.apiErrSprintActiveExists)
    expect(localizeApiError(err, en)).toBe("An active or planned sprint already exists")
    expect(localizeApiError(err, ja)).toBe("進行中または計画中のスプリントが既にあります")
  })

  it("falls back to the raw server message for unknown or missing codes", () => {
    expect(localizeApiError(new ApiError("サーバー固有", 400, undefined, "SOMETHING_NEW"), id)).toBe("サーバー固有")
    expect(localizeApiError(new ApiError("コードなし", 400), id)).toBe("コードなし")
  })

  it("uses serverMessage (not an already-localized message) for unknown codes", () => {
    const err = new ApiError("localized", 400, undefined, "SOMETHING_NEW", "サーバー")
    expect(localizeApiError(err, en)).toBe("サーバー")
  })

  it("handles plain errors, code-carrying objects and non-errors", () => {
    expect(localizeApiError(new Error("boom"), id)).toBe("boom")
    expect(localizeApiError({ code: "NOT_FOUND" }, id)).toBe(id.apiErrNotFound)
    expect(localizeApiError("text", id)).toBe("text")
  })

  it("has a non-empty message for every error code in every language", () => {
    for (const code of API_ERROR_CODES) {
      for (const t of [ja, en, id]) {
        expect(t[API_ERROR_MESSAGE_KEYS[code]].trim()).not.toBe("")
      }
    }
  })
})

describe("apiFetch error localization", () => {
  it("keeps the server message when no UI language is known", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "日付が不正です", code: "INVALID_DATE" }, { status: 400 })))
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError
    expect(err.message).toBe("日付が不正です")
    expect(err.serverMessage).toBe("日付が不正です")
  })

  it("localizes the message for a known code once the language is set", async () => {
    setApiErrorLanguage("id")
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "日付が不正です", code: "INVALID_DATE" }, { status: 400 })))
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError
    expect(err.message).toBe("Tanggal tidak valid")
    expect(err.serverMessage).toBe("日付が不正です")
    expect(err.code).toBe("INVALID_DATE")
  })

  it("keeps the server message for unknown codes even with a language", async () => {
    setApiErrorLanguage("en")
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "独自エラー", code: "custom_code" }, { status: 400 })))
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError
    expect(err.message).toBe("独自エラー")
  })

  it("localizes network failures", async () => {
    setApiErrorLanguage("en")
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))
    const err = (await apiFetch("/api/x").catch((e: unknown) => e)) as ApiError
    expect(err.code).toBe("NETWORK_ERROR")
    expect(err.message).toBe("Cannot reach the server. Please check your network")
    expect(err.serverMessage).toBe("Failed to fetch")
  })
})
