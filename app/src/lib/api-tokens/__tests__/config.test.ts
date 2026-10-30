import { describe, expect, it } from "vitest"
import { API_TOKEN_EXPIRY_DAYS, loadApiTokenConfig } from "../config"

describe("loadApiTokenConfig", () => {
  it("defaults: enabled, 5 per user, no unlimited tokens, 120 req/min", () => {
    expect(loadApiTokenConfig({})).toEqual({ enabled: true, maxPerUser: 5, allowNoExpiry: false, ratePerMinute: 120, writeRatePerMinute: 30 })
  })

  it("reads the env overrides", () => {
    const cfg = loadApiTokenConfig({
      API_TOKENS_ENABLED: "off",
      API_TOKEN_MAX_PER_USER: "2",
      API_TOKEN_ALLOW_NO_EXPIRY: "true",
      API_V1_RATE_LIMIT_PER_MIN: "30",
      API_V1_WRITE_RATE_LIMIT_PER_MIN: "10",
    })
    expect(cfg).toEqual({ enabled: false, maxPerUser: 2, allowNoExpiry: true, ratePerMinute: 30, writeRatePerMinute: 10 })
  })

  it.each(["0", "false", "no", "disabled", " OFF "])("treats %s as disabled", (v) => {
    expect(loadApiTokenConfig({ API_TOKENS_ENABLED: v }).enabled).toBe(false)
  })

  it("ignores invalid numbers", () => {
    const cfg = loadApiTokenConfig({ API_TOKEN_MAX_PER_USER: "-1", API_V1_RATE_LIMIT_PER_MIN: "abc" })
    expect(cfg.maxPerUser).toBe(5)
    expect(cfg.ratePerMinute).toBe(120)
  })

  it("offers 30 / 90 / 365 day expiries", () => {
    expect(API_TOKEN_EXPIRY_DAYS).toEqual([30, 90, 365])
  })
})
