# Remote Branch Cleanup Runbook

## Keep

- `master`

## Hold For Manual Review

- `codex/feishu-card-only-finalize`
  - unique commits relative to `origin/master`
- `feature/feishu`
  - unique commit relative to `origin/master`
- `feature/scheduled-work`
  - multiple unique commits relative to `origin/master`

These branches must not be deleted until their remaining value is reviewed and either merged, cherry-picked, or intentionally discarded.

## Safe To Delete

- `master-backup-20260306-145139`
  - no unique commits relative to `origin/master`
- `server-workspace`
  - no unique commits relative to `origin/master`

## Audit Commands

Check branch-only commits:

```bash
git log --oneline origin/master..origin/<branch>
```

Delete approved remote branch:

```bash
git push origin --delete <branch>
```

Re-list remote branches:

```bash
git branch -r
```
