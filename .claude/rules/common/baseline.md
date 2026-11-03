# Baseline Conventions (always loaded)

The four language-agnostic conventions every session needs. Everything else is
on-demand: language rules attach via `paths:` frontmatter, skills load by name.

1. **Review severity vocabulary** — shared by all reviewer agents and the MR
   flow:

   | Level | Meaning | Action |
   |-------|---------|--------|
   | CRITICAL | Security vulnerability or data-loss risk | BLOCK |
   | HIGH | Bug or significant quality issue | WARN |
   | MEDIUM | Maintainability concern | INFO |
   | LOW | Style or minor suggestion | NOTE |

2. **Test coverage ≥ 80 % (lines and functions).** Enforced in CI. This is the
   single place the number is defined — do not restate it elsewhere.

3. **Agent `model:` frontmatter uses generation-tracking aliases**
   (`haiku` / `sonnet` / `opus`), never pinned model IDs — versions change, the
   tiers do not.

4. **Research before building.** Search for existing implementations and
   battle-tested libraries before writing new code (`search-first` skill;
   `documentation-lookup` for current library docs). The forge is internal
   GitLab — automation uses `glab`; `gh` is a public code-search tool only.
