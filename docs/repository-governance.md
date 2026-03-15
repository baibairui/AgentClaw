# Repository Governance

## Branch Model

- `master` is the only long-lived mainline branch.
- All work must start from the latest `master`.
- Short-lived branches must use one of:
  - `feat/<topic>`
  - `fix/<topic>`
  - `refactor/<topic>`
  - `chore/<topic>`

Do not keep long-running remote branches for backups, experiments, or personal workspaces.

## Pull Request Rules

- One PR must solve one problem.
- The PR title must use a type prefix such as `feat:`, `fix:`, `refactor:`, `chore:`, or `docs:`.
- If unrelated changes appear during development, split them into a new branch and PR.
- Default merge strategy is squash merge.

## Required Before Merge

- Build and tests pass.
- At least one review is completed.
- The branch is updated to the latest `master`.
- The PR description clearly states scope and out-of-scope items.

## Forbidden Repository Content

Never commit:

- private keys, certificates, secrets, or local env files
- `.deploy-backups/`
- workspace snapshots
- temporary exports
- machine-local debugging artifacts

Use `.gitignore` to reduce mistakes, but do not rely on it as the only control.

## Remote Branch Cleanup Policy

- Delete feature branches after PR merge.
- Review stale remote branches regularly.
- Before deleting a remote branch, check whether it still has commits not merged into `master`.
- Backup needs must be handled by tags, releases, or external archives, not Git branches.

## Protected Branch Expectations

`master` should have these GitHub protections:

- require pull request before merging
- require approval
- require status checks to pass
- block force pushes
- block deletion
- auto-delete head branches after merge
