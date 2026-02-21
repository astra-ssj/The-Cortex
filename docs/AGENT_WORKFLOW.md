# CORTEX — Agent workflow template

Use this header and steps when running an agent (or copy-paste for a new task).

```text
# ═══════════════════════════════════════════════
# AGENT: [NAME]
# PURPOSE: [What this agent does]
# TOUCHES: [Files/services affected]
# BRANCH: feature/[branch-name]
# ═══════════════════════════════════════════════
```

---

## GIT SETUP — run first, always

```bash
git checkout main
git pull origin main
git checkout -b feature/[branch-name]
```

---

## Work

Reference files with `@file1` `@file2` as needed. Do the actual work.

---

## GIT CLEANUP — run last, always

- Stage **only** the files you changed (never `git add .`):

  ```bash
  git add [path/to/file1] [path/to/file2]
  ```

- Commit and push:

  ```bash
  git commit -m "type: description"
  git push origin feature/[branch-name]
  ```

- Open a PR. Do not merge to main directly. CI must be green before merging.

See [QUALITY_GATES.md](./QUALITY_GATES.md) for CI jobs and branch protection.
