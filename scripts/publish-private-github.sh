#!/usr/bin/env bash
# Publish the *existing verified SUDERN Git history* to a dedicated PRIVATE GitHub repository.
# Requires the authenticated GitHub CLI on an operator-controlled workstation or cloud browser.
# Does not overwrite GitHub branches, reveal credentials, or change Vercel production aliases.
set -Eeuo pipefail

OWNER="Chrispine-1210"
NAME="${1:-sudern-institutional-platform}"
case "$NAME" in
  ''|*[!a-zA-Z0-9._-]*) echo 'ERROR: Invalid GitHub repository name' >&2; exit 2;;
esac
REPO="${OWNER}/${NAME}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v gh >/dev/null || { echo 'BLOCKED: GitHub CLI is missing' >&2; exit 2; }
command -v git >/dev/null || { echo 'BLOCKED: Git is missing' >&2; exit 2; }
gh auth status >/dev/null 2>&1 || { echo 'BLOCKED: GitHub CLI authentication is required' >&2; exit 2; }
[[ -d .git ]] || { echo 'BLOCKED: Restore the supplied Git bundle before publishing' >&2; exit 2; }
[[ $(git branch --show-current) == main ]] || { echo 'BLOCKED: publish from main only' >&2; exit 2; }
[[ -z $(git status --porcelain) ]] || { echo 'BLOCKED: working tree contains uncommitted modifications' >&2; exit 2; }
# Fail closed on obvious credential files even when the operator has manually staged them.
if git ls-files | grep -E '(^|/)(\.env($|\.[^/]+$)|\.vercel/|[^/]+\.pem$|[^/]+\.key$)' | grep -vE '^\.env\.example$' >/dev/null; then
  echo 'BLOCKED: committed credential-like files detected' >&2; exit 2
fi

if repo_private="$(gh repo view "$REPO" --json isPrivate --jq '.isPrivate' 2>/dev/null)"; then
  private="$repo_private"
  [[ "$private" == true ]] || { echo "BLOCKED: $REPO exists but is not private" >&2; exit 2; }
  echo "Existing private repository confirmed: $REPO"
  if git remote get-url origin >/dev/null 2>&1; then
    existing="$(git remote get-url origin)"
    case "$existing" in
      "https://github.com/$REPO"|"https://github.com/$REPO.git"|"git@github.com:$REPO.git") ;;
      *) echo "BLOCKED: origin points to a different repository: $existing" >&2; exit 2;;
    esac
  else
    git remote add origin "https://github.com/$REPO.git"
  fi
  # Non-force push prevents replacing a README or other existing repository work.
  git push --set-upstream origin main
else
  echo "Creating private repository $REPO from the verified local Git history..."
  gh repo create "$REPO" --private --source=. --remote=origin --push
fi

remote_sha="$(gh api "repos/$REPO/commits/main" --jq .sha)"
local_sha="$(git rev-parse HEAD)"
[[ "$remote_sha" == "$local_sha" ]] || { echo 'FAIL: remote main SHA differs from verified local HEAD' >&2; exit 1; }
visibility="$(gh repo view "$REPO" --json isPrivate --jq .isPrivate)"
[[ "$visibility" == true ]] || { echo 'FAIL: remote repository not private' >&2; exit 1; }
cat <<REPORT
PASS: private repository published and exact main SHA confirmed.
Repository: https://github.com/$REPO
Exact SHA: $remote_sha
CI workflow: .github/workflows/quality.yml
Next gate: inspect GitHub Actions for this exact SHA; do not certify until isolated PostgreSQL job and restore test finish successfully.
REPORT
# An initial run may be queued for a few moments; showing runs is diagnostic, not certification.
gh run list --repo "$REPO" --workflow quality.yml --branch main --limit 5 || true
