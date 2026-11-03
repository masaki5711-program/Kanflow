---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

- Framework: **pytest**. Prefer fixtures over setup/teardown; parametrize over duplicated cases.
- Categorize tests with `pytest.mark` (unit / integration).
- Measure coverage with `pytest --cov`; the coverage bar is owned by common/baseline.md.

Detailed pytest/fixture conventions on demand: skill `python-testing`.
