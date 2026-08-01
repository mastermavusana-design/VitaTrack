# VitaTrack — project notes for Claude

## Git / deploy workflow (set by SALVATOR_ORBIS, 2026-08-01)
- Commit **everything to `main`** and push. `main` is the Vercel Production branch, so
  pushing to `main` deploys the live site. Do this going forward — don't leave work on
  feature branches unless explicitly asked.
- When finishing a change, commit to `main` and push `origin main`.

## Environment note
- The repo is a Windows folder mounted into the Linux sandbox. The mount blocks
  git's removal of its own lock files (`unlink` = "Operation not permitted"), so
  git **write** operations (commit/merge/push) fail from the sandbox and leave stale
  `.git/index.lock` / `.git/HEAD.lock`. Run git write commands in the user's own
  Windows PowerShell instead. Sandbox git is fine for read-only inspection.
