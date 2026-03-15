# GitHub Branch Protection Settings

Apply these settings to `master` in GitHub:

- Require a pull request before merging
- Require approvals
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Do not allow force pushes
- Do not allow deletions
- Automatically delete head branches

## Manual Steps

These settings are applied in the GitHub repository settings UI.

This repository cleanup turn does not automate those settings, because they depend on GitHub repository permissions outside local git operations.
