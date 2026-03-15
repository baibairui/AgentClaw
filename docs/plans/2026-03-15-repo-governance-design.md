# Repository Governance Design

**Date:** 2026-03-15

**Goal:** 在不改动现有 `master` 内容的前提下，收紧远程分支治理和 PR 合并流程，降低脏分支、超大 PR、敏感文件入仓和历史备份污染仓库的风险。

## Current Problems

- 远程长期存在用途不清的功能分支、实验分支和备份分支。
- 当前打开的 PR 暴露出分支基线不干净和改动范围失控的问题。
- 仓库里曾出现 `.deploy-backups/` 和 `pem` 私钥等不应进入源码仓库的内容。
- `master` 目前承担了代码主线之外的纠偏职责，缺少受保护分支规则。

## Scope

本次治理只处理仓库治理和协作规范，不重构业务代码，不改变当前 `master` 的文件内容。

## Branch Model

### Long-lived branches

- `master`
  - 唯一主分支。
  - 只通过 PR 合并进入。
  - 禁止直接推送。

### Short-lived branches

- `feat/<topic>`
- `fix/<topic>`
- `refactor/<topic>`
- `chore/<topic>`

这些分支只服务单一任务，PR 合并后立即删除远程分支。

### Disallowed branch roles

以下角色不再通过远程 Git 分支承载：

- 备份分支
- 长期实验分支
- 杂项工作区分支
- 混合多个主题的总包分支

## Pull Request Rules

- 一个 PR 只解决一个主题。
- PR 标题必须带类型前缀：`feat:`、`fix:`、`refactor:`、`chore:`、`docs:`。
- 出现顺手修改的跨模块内容时，必须拆分到新分支或新 PR。
- 默认使用 squash merge。
- 合并前至少满足：
  - CI 通过
  - 至少一轮 review
  - 分支同步到最新 `master`

## Repository Hygiene Rules

- 禁止提交：
  - 私钥、证书、token
  - `.deploy-backups/`
  - 本地调试产物
  - 临时导出文件
- 使用 `.gitignore` 和 review 双重拦截。
- 对已存在的历史污染，优先先从当前分支和远程可见分支中清除，再视情况决定是否做历史清理。

## Remote Cleanup Strategy

### Keep

- `master`

### Review and delete after确认

- `codex/feishu-card-only-finalize`
- `feature/feishu`
- `feature/scheduled-work`
- `server-workspace`
- `master-backup-20260306-145139`

删除前先检查这些分支是否还有未合入且值得保留的提交；若有，先整理为新 PR。

## Protection Settings

建议为 GitHub 上的 `master` 启用：

- Require a pull request before merging
- Require approvals
- Require status checks to pass
- Do not allow force pushes
- Do not allow deletions
- Automatically delete head branches

## Rollout Order

1. 先完成分支审计和远程清理。
2. 再补齐 `.gitignore`、PR 模板和治理文档。
3. 最后在 GitHub 上开启受保护分支规则。

## Success Criteria

- `master` 之外不再保留无用途说明的长期远程分支。
- 新 PR 范围明显收缩，标题与改动一致。
- 敏感文件和备份产物不再进入仓库。
- 团队成员知道从哪个分支切、如何提 PR、何时删除分支。
