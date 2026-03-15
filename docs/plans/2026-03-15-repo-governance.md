# Repository Governance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不改动 `master` 当前内容的前提下，完成仓库远程分支治理、协作规范落地和必要的仓库卫生修复。

**Architecture:** 先做远程分支和 PR 现状审计，再补齐仓库内的治理文档和忽略规则，最后给出或执行 GitHub 侧保护配置。所有变更都在独立治理分支上完成，通过 PR 合并。

**Tech Stack:** Git, GitHub, Markdown, repository config files

---

### Task 1: Audit remote branches and open PRs

**Files:**
- Modify: `docs/plans/2026-03-15-repo-governance-design.md`

**Step 1: Capture current remote state**

Run: `git branch -a --verbose --no-abbrev`

Expected: 列出本地分支、远程分支和当前提交。

**Step 2: Capture open PR state**

Run: `node -e "fetch('https://api.github.com/repos/baibairui/codex-gateway/pulls?state=open').then(r=>r.json()).then(prs=>console.log(JSON.stringify(prs.map(pr => ({number: pr.number, title: pr.title, head: pr.head.label, base: pr.base.ref})), null, 2)))"`

Expected: 输出当前打开的 PR 摘要。

**Step 3: Update audit notes if needed**

把审计结果补充到设计文档相关章节中。

**Step 4: Commit**

```bash
git add docs/plans/2026-03-15-repo-governance-design.md
git commit -m "docs: record repository governance audit"
```

### Task 2: Harden repository ignore rules

**Files:**
- Modify: `.gitignore`
- Test: `.gitignore`

**Step 1: Write the failing check**

人工检查 `.gitignore` 是否覆盖：
- `.deploy-backups/`
- `*.pem`
- 常见临时目录

**Step 2: Update `.gitignore` minimally**

只添加当前治理需要的忽略项，避免引入和任务无关的格式化噪音。

**Step 3: Verify ignore rules**

Run: `git check-ignore .deploy-backups/sample file.pem`

Expected: 两个路径都被忽略。

**Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: harden ignore rules for sensitive and backup files"
```

### Task 3: Add repository governance guide

**Files:**
- Create: `docs/repository-governance.md`
- Modify: `README.md`

**Step 1: Write governance guide**

内容至少包括：
- 分支模型
- PR 规则
- 合并策略
- 禁止入仓内容
- 分支删除规则

**Step 2: Link it from README**

在 README 的协作或开发章节增加入口，方便后续成员查阅。

**Step 3: Verify docs are coherent**

手动检查 README 链接和文档描述是否一致。

**Step 4: Commit**

```bash
git add docs/repository-governance.md README.md
git commit -m "docs: add repository governance guide"
```

### Task 4: Add PR hygiene template

**Files:**
- Modify: `.github/pull_request_template.md`

**Step 1: Tighten template prompts**

模板应强制作者说明：
- 本 PR 只解决什么问题
- 明确排除了哪些不相关改动
- 是否包含敏感文件、备份文件或生成产物
- 如何验证

**Step 2: Review wording**

确保模板短、硬、可执行，不写空泛流程。

**Step 3: Commit**

```bash
git add .github/pull_request_template.md
git commit -m "docs: tighten pull request template"
```

### Task 5: Prepare remote cleanup command set

**Files:**
- Create: `docs/operations/remote-branch-cleanup-2026-03-15.md`

**Step 1: Record keep/delete decisions**

按分支逐个写清：
- keep
- delete
- hold for manual review

**Step 2: Record exact commands**

写出对应命令，例如：
- `git push origin --delete <branch>`
- `git log origin/master..<branch> --oneline`

**Step 3: Validate command safety**

所有删除命令前必须先有审计命令，避免误删。

**Step 4: Commit**

```bash
git add docs/operations/remote-branch-cleanup-2026-03-15.md
git commit -m "docs: add remote branch cleanup runbook"
```

### Task 6: Execute safe remote cleanup

**Files:**
- Modify: `docs/operations/remote-branch-cleanup-2026-03-15.md`

**Step 1: Re-check branch divergence**

Run: `git log --oneline origin/master..<branch>`

Expected: 明确看到分支相对 `master` 是否还有独有提交。

**Step 2: Delete only approved remote branches**

Run: `git push origin --delete <branch>`

Expected: GitHub 返回删除成功。

**Step 3: Re-list remote branches**

Run: `git branch -r`

Expected: 已批准删除的分支不再出现。

**Step 4: Commit updated runbook notes**

```bash
git add docs/operations/remote-branch-cleanup-2026-03-15.md
git commit -m "docs: record remote branch cleanup execution"
```

### Task 7: Document GitHub branch protection settings

**Files:**
- Create: `docs/operations/github-branch-protection.md`

**Step 1: Write exact GitHub settings**

记录需要手动在 GitHub UI 配置的规则。

**Step 2: Mark what is not automated here**

明确说明哪些设置因权限或工具限制需要手动完成。

**Step 3: Commit**

```bash
git add docs/operations/github-branch-protection.md
git commit -m "docs: document branch protection settings"
```
