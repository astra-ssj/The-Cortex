# CORTEX — Cursor setup & first session

One-time Cursor configuration and how to use Composer for every multi-file change.

---

## Checklist before your first CORTEX session

| Item | Status | Where |
|------|--------|--------|
| Privacy Mode | ✅ ON | Cursor Settings |
| `.cursorrules` | ✅ | Repo root |
| `.cursorignore` | ✅ | Repo root |
| Default model | ✅ claude-sonnet-4-6 | Cursor Settings → Models |
| Composer context | ⬜ **Codebase** | Cursor Settings → Features → Composer |
| Auto Run Mode | ⬜ **OFF** | Cursor Settings → Features → Agent |
| Repo on GitHub & indexed | ⬜ | Push repo, let Cursor index |

**Composer:** Enable **“Always show composer”** and set **Composer context → Codebase** (not just current file).

**Agent:** Set **Auto Run Mode → OFF**. Every terminal command is then proposed first; you approve or reject. Human-in-the-loop, as in ZTAIP.

---

## Composer workflow (multi-file changes)

Composer is for every multi-file feature or refactor.

1. **Open Composer**  
   `Cmd+Shift+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux).

2. **Write a concrete spec and tag pattern files with `@filename`**  
   Example:

   ```
   Add the GDPR framework to the compliance engine.
   Follow the exact pattern in @nist_csf.py.
   Register it in @registry.py.
   Add the framework ID to the FrameworkId enum in @compliance.py.
   Write 3 pytest tests covering: framework loads successfully,
   all controls have at least one requirement, all requirements
   have at least one evidence_type.
   ```

   The `@filename` references are critical — always tag the pattern files you want Cursor to follow.

3. **Review the diff**  
   Cursor will propose changes across the relevant files. Review, then approve or ask for edits.

---

## First Composer prompt after setup

Once the repo is indexed, open Composer and run:

```
@codebase I need to add the GDPR framework next.
Show me the current state of the framework registry
and confirm you understand the pattern before I give
you the build instruction.
```

Then give the full build instruction (as in the example above) when you’re ready.

---

## Clone and open the repo (new machine)

In Cursor’s terminal (`Ctrl+\`` or **View → Terminal**):

```bash
git clone https://github.com/AstraLabs-AI/The-Cortex
cd The-Cortex
```

Then **File → Open Folder** and select the `The-Cortex` folder (or open it from the command line so Cursor opens that folder).

---

## Let Cursor index the repo

Once the folder is open, Cursor starts indexing automatically. You’ll see a progress indicator in the bottom bar. **Wait for indexing to finish** before using your first Agent session — that’s what makes `@codebase` work accurately.

---

## What the GitHub connection is for

- Cloning and pushing via the **Source Control** panel
- **@codebase** indexing across the full repo
- Agent being able to read any file when you use **@filename**

---

## Daily workflow once connected

```
Start session
    ↓
Cmd+I → Composer → Agent mode
    ↓
Build something with Cursor
    ↓
Review the diff
    ↓
Cursor’s terminal:
  git add .
  git commit -m "feat: add GDPR framework"
  git push
    ↓
GitHub CI pipeline runs automatically
```

You can also use Cursor’s **Source Control** panel (`Ctrl+Shift+G`) to stage, commit, and push — same as VS Code’s git panel.

---

## One thing to configure after connecting

**Branch protection on GitHub** so neither you nor Cursor can push directly to `main`:

1. **GitHub** → **The-Cortex** repo → **Settings** → **Branches**
2. **Add branch protection rule**
3. **Branch name pattern:** `main`
4. **Require a pull request before merging** → ON
5. **Require status checks to pass** → ON (your CI pipeline)

Then work on feature branches and merge via PRs.
