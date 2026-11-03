---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
# TypeScript/JavaScript Patterns

- **API response envelope** — every API response is `ApiResponse<T>` with `success: boolean`, optional `data`, optional `error` message, and optional `meta` (`total`, `page`, `limit`) for paginated results.
- **Repository pattern** — data access behind a `Repository<T>` interface exposing `findAll(filters?)`, `findById`, `create`, `update`, `delete`; business logic depends on the interface, not the storage mechanism.
