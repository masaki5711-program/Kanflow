---
name: e2e-testing
description: Playwright E2E authoring strategy — suite organization, Page Object Model, selector and wait discipline, config/artifact policy, flaky-test protocol, CI wiring. Use when: writing or restructuring Playwright specs, page objects, or playwright.config, diagnosing flaky E2E tests, or deciding wait/selector/artifact strategy for L4 UI or API integration flows. Do not use when: running, maintaining, or quarantining test suites at scale (delegate to the e2e-runner agent), unit/integration test design (tdd-workflow, rust-testing, python-testing), ad-hoc visual verification of a deployed UI (browser-qa), or post-deploy regression monitoring (canary-watch).
origin: ECC
---

# E2E Testing (Playwright)

## Repo-specific constraints

- Target is L4 (Next.js) UI and its L3 API; execution and suite maintenance belong to the `e2e-runner` agent — this skill covers authoring decisions.
- Select by `data-testid`, never by display text: the UI is JA/EN/ID and text-based selectors break per locale.
- CI is GitLab (`.gitlab-ci.yml` in the product repo), not GitHub Actions. E2E must pass before MR merge (iotpf-git-workflow §4).
- Test data is synthetic only — never real plant codes, lot numbers, or shop-floor values in fixtures (iotpf-git-workflow §6).
- Streaming/dashboard views: assert on settled states via specific API responses, not on continuously updating values.

## Structure rules

- One page object per page/major surface: locators + intent-level actions, no assertions inside the POM.
- Specs grouped by feature directory; shared login/data setup in fixtures, not per-test beforeEach duplication.
- Each spec independent and order-free; no state leakage between tests (parallel-safe).

## Wait discipline — decision table

| Need | Use | Never |
|---|---|---|
| Element readiness before act | Auto-waiting locator actions | Manual visibility checks then raw click |
| Data loaded | waitForResponse on the specific API route | waitForTimeout / fixed sleeps |
| Animation / menu stability | waitFor visible state, then act | Clicking mid-animation |
| Navigation settled | URL or element assertion | networkidle as a habit (slow, flaky on streams) |

## Config policy

- CI: bounded retries (≤2), single worker or explicit sharding, forbidOnly on.
- Artifacts: trace on-first-retry, screenshot only-on-failure, video retain-on-failure — never "always" (storage, runtime).
- Explicit action/navigation timeouts; webServer reuse locally, fresh in CI.
- Browser matrix: chromium as the gate; others as scheduled/nightly, not per-MR.

## Flaky-test protocol

1. Reproduce: run the spec with repeat-each ≥10 before declaring flaky.
2. Diagnose the cause class: race (missing auto-wait), network timing (missing waitForResponse), animation, or test interdependence.
3. Fix the root cause — never widen timeouts as the fix.
4. If unfixable now: quarantine with fixme + tracked issue link; a skip without an issue is forbidden (silent failure).

## Authoring checklist

- [ ] data-testid selectors only; no text/CSS-structure selectors
- [ ] No waitForTimeout anywhere
- [ ] Independent, parallel-safe specs; synthetic fixtures
- [ ] Failure artifacts configured; flaky quarantine has an issue link
- [ ] Critical flows covered: the paths listed in the MR test plan

## Related (read first)

- `e2e-runner` agent — executes/maintains suites, quarantines, uploads artifacts.
- `tdd-workflow` skill — where E2E sits in the RED-GREEN-REFACTOR cycle and coverage gates.
- `browser-qa` skill — one-off visual/interaction verification, screenshots for design review.
- `frontend-patterns` skill — the component patterns under test (testid conventions).
- `canary-watch` skill — post-deploy monitoring, not pre-merge testing.
