---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Coding Style

## Types

- Explicit parameter/return types on exported functions, shared utilities, and public class methods; let locals infer.
- `interface` for object shapes that may be extended/implemented; `type` for unions, intersections, tuples, mapped/utility types.
- String-literal unions over `enum` (use `enum` only when required for interoperability).
- Avoid `any`; use `unknown` for external/untrusted input and narrow it; use generics when the type depends on the caller.
- Extract repeated inline object shapes into named types.
- React props: named `interface`/`type`, callbacks typed explicitly. No `React.FC`.
- `.js`/`.jsx` files: JSDoc types where they add clarity and a TS migration is impractical; keep JSDoc aligned with runtime behavior.

## Immutability

- Never mutate inputs; return new objects (spread, `Readonly<T>` parameters).

## Errors

- `async/await` with `try-catch`; treat caught values as `unknown` and narrow before use.
- Log with error context server-side; rethrow or surface a user-friendly message — never swallow.

## Boundaries

- Zod schema validation at system boundaries; infer types from schemas (`z.infer`), not parallel hand-written types.

## Logging

- No `console.log` in production code — use a logger. Enforced by hooks (see hooks.md).
