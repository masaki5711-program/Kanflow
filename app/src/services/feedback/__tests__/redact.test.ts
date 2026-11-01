import { describe, expect, it } from "vitest"
import { allowedHostsFromEnv, findResidualSecret, redactText } from "../redact"

const red = (s: string, hosts?: string[]) => redactText(s, hosts ? { allowedHosts: hosts } : {})

describe("redactText: nothing secret survives", () => {
  it.each([
    ["Authorization header", "Authorization: Bearer abcdef0123456789abcdef0123456789", "abcdef0123456789"],
    ["Cookie header", "cookie: session=abc123def456ghi789; theme=dark", "abc123def456ghi789"],
    ["bare bearer token", "retry with bearer eyJabc.def_ghi-0123456789 now", "eyJabc.def_ghi-0123456789"],
    ["Kanflow API token", "token kfl_AbCdEfGhIjKlMnOpQrStUv0123456789 rejected", "kfl_AbCdEfGh"],
    ["GitLab token", "glpat-abcdefghijklmnopqrstuvwx used", "glpat-abcdef"],
    ["AWS key", "key AKIAABCDEFGHIJKLMNOP leaked", "AKIAABCDEFGHIJKLMNOP"],
    ["URL password", "clone https://alice:hunter2pass@git.example.test/x.git", "hunter2pass"],
    ["env assignment", "DB_PASSWORD=Sup3rS3cretValue99 failed", "Sup3rS3cretValue99"],
    ["private key block", "-----BEGIN RSA PRIVATE KEY-----\nMIIEabc\n-----END RSA PRIVATE KEY-----", "MIIEabc"],
  ])("%s", (_n, input, leaked) => {
    const out = red(input)
    expect(out.text).not.toContain(leaked)
    expect(out.counts.secret).toBeGreaterThan(0)
    expect(findResidualSecret(out.text)).toBeNull()
  })
})

describe("redactText: identifiers", () => {
  it("masks e-mail, IPv4, IPv6, MAC", () => {
    const out = red("mail bob@corp.example.com from 192.168.10.5 and 2001:db8::1 mac aa:bb:cc:dd:ee:ff")
    expect(out.text).toBe("mail <email> from <ip> and <ip> mac <mac>")
    expect(out.counts).toMatchObject({ email: 1, ip: 2, mac: 1 })
    expect(out.total).toBe(4)
  })

  it("masks home directories of every platform", () => {
    expect(red("/home/alice/proj/a.rs").text).toBe("~/proj/a.rs")
    expect(red("/Users/bob/x").text).toBe("~/x")
    expect(red("C:\\Users\\carol\\x").text).toBe("~\\x")
    expect(red("cd /root/work").text).toBe("cd ~/work")
  })

  it("masks internal hosts but keeps allow-listed ones", () => {
    expect(red("https://gitlab.scm.service.infosys.yamaha.com/g/r.git").text).toBe("https://<host>/g/r.git")
    expect(red("ping pfs01.factory.local failed").text).toBe("ping <host> failed")
    expect(red("http://pfs01:8080/x").text).toBe("http://<host>:8080/x")
    expect(red("https://crates.io/api/v1/x").text).toBe("https://crates.io/api/v1/x")
    expect(red("see docs.rs and github.com").text).toBe("see docs.rs and github.com")
    expect(red("https://gitlab.corp.test/x", ["gitlab.corp.test"]).text).toBe("https://gitlab.corp.test/x")
    expect(red("https://a.b.corp.local/x", ["*.corp.local"]).text).toBe("https://a.b.corp.local/x")
  })

  it("leaves file names, package versions and code paths alone", () => {
    const text = "src/config.test.ts react@18.3.1 com.example.Foo.bar 3.14 foo::bar::baz"
    expect(red(text).text).toBe(text)
  })

  it("is idempotent", () => {
    const once = red("Authorization: Bearer abcdef0123456789abcdef0123456789 bob@corp.example.com 10.0.0.1 /home/x/y").text
    expect(red(once).text).toBe(once)
  })
})

describe("redactText: key names, look-alike text, hosts and paths (review hardening)", () => {
  it.each([
    ["DB_PASS", "DB_PASS=hunter22x done", "hunter22x"],
    ["service password key", "svc_password: correcthorse", "correcthorse"],
    ["pwd", "pwd=abcdef", "abcdef"],
    ["_SECRET", "APP_SECRET=plainwordsecret", "plainwordsecret"],
    ["_TOKEN", "GITLAB_TOKEN=notsolongtoken", "notsolongtoken"],
    ["_KEY", "STRIPE_KEY=somevalue123", "somevalue123"],
    ["camelCase", 'config {"apiKey": "plainvalue"}', "plainvalue"],
    ["DATABASE_URL", "DATABASE_URL=mysql://app:pw@db.corp.test/x", "pw@"],
    ["URL with user only", "git clone https://deploy@git.example.test/x.git", "deploy@"],
    ["JSON key", '{"client_secret": "abcdefghij"}', "abcdefghij"],
    ["full-width key", "ＤＢ＿ＰＡＳＳ＝fullwidthvalue", "fullwidthvalue"],
    ["zero-width split key", "DB_PA\u200bSS=splitvalue1", "splitvalue1"],
    ["bidi in value", "TOKEN=abc\u202edef123", "def123"],
  ])("%s", (_n, input, leaked) => {
    const out = red(input)
    expect(out.text).not.toContain(leaked)
    expect(out.counts.secret).toBeGreaterThan(0)
    expect(findResidualSecret(out.text)).toBeNull()
  })

  it("the residual check looks through look-alike and invisible characters too", () => {
    expect(findResidualSecret("ＤＢ＿ＰＡＳＳ＝fullwidthvalue")).toBe("secret-assignment")
    expect(findResidualSecret("DB_PA\u200bSS=splitvalue1")).toBe("secret-assignment")
    expect(findResidualSecret("clone https://deploy@git.example.test/x")).toBe("url-userinfo")
  })

  it("does not touch ordinary words that merely contain 'pass' or 'key'", () => {
    const text = "tests passed: 12, keyboard: ok, monkey=banana, pass: [REDACTED]"
    expect(red(text).text).toBe(text)
  })

  it("masks UNC paths, user@host, host:port, drive paths and bare names after host words", () => {
    expect(red("open \\\\fileserver\\share\\specs\\a.xlsx").text).toBe("open <host>")
    expect(red("scp a deploy@pfs01:/srv").text).toBe("scp a deploy@<host>:/srv")
    expect(red("connect to pfs01:5432 failed").text).toBe("connect to <host>:5432 failed")
    expect(red("localhost:3000 and pfs01:5432").text).toBe("localhost:3000 and <host>:5432")
    expect(red("read D:\\app\\git\\x.rs and E:/data/y").text).toBe("read <path> and <path>")
    expect(red("ssh pfs-web-01 refused").text).toBe("ssh <host> refused")
    expect(red("hostname plant7 not found").text).toBe("hostname <host> not found")
  })

  it("keeps system drive folders, versions and package tags readable", () => {
    for (const text of ["C:\\Windows\\System32\\x.dll", "left-pad@latest", "react@18.3.1", "status:500 line:12", "https://github.com:443/x"]) {
      expect(red(text).text, text).toBe(text)
    }
  })
})

describe("allowedHostsFromEnv", () => {
  it("adds the configured hosts to the defaults", () => {
    const hosts = allowedHostsFromEnv({ FEEDBACK_ALLOWED_HOSTS: " Git.Corp.Test , *.mirror.test " })
    expect(hosts).toContain("git.corp.test")
    expect(hosts).toContain("*.mirror.test")
    expect(hosts).toContain("github.com")
    expect(hosts).toContain("gitlab.scm.service.infosys.yamaha.com")
    expect(allowedHostsFromEnv({ GIT_ALLOWED_HOSTS: "git.corp.test" })).toContain("git.corp.test")
  })
})

describe("findResidualSecret: what the redactor lets through is refused", () => {
  it("flags a plain-word password and key blocks", () => {
    expect(findResidualSecret("login with password=correcthorse")).toBe("secret-assignment")
    expect(findResidualSecret("-----BEGIN PGP PRIVATE KEY BLOCK-----")).toBe("key-block")
    expect(findResidualSecret("Authorization: Basic dXNlcjpwYXNz")).toBe("auth-header")
  })

  it("flags a long mixed-case token", () => {
    expect(findResidualSecret("value Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12")).toBe("long-token")
  })

  it("does not flag ordinary failure text", () => {
    for (const text of [
      "error: password: required",
      "token=[REDACTED]",
      "git hash 3f2a9c1d7e5b4a6c8d0e1f2a3b4c5d6e7f8a9b0c and uuid 123e4567-e89b-12d3-a456-426614174000",
      "thread 'main' panicked at crates/forge-core/src/some-very-long-module-name/with_a_long_file_name_here.rs",
      "FG-AUTH-0003 permission denied",
    ]) {
      expect(findResidualSecret(text), text).toBeNull()
    }
  })
})

describe("residual check after redaction (the 422 rule)", () => {
  it("a value the redactor cannot judge is still refused", () => {
    const out = red("config blob Ab12Cd34Ef56Gh78Ij90Kl12Mn34Op56Qr78St90Uv12")
    expect(findResidualSecret(out.text)).toBe("long-token")
  })
})
