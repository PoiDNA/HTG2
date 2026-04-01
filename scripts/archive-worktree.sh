#!/usr/bin/env bash
set -euo pipefail

# archive-worktree.sh — Archiwizuje dirty worktree przed usunięciem
# Smart-fail: puste zbiory → pomiń; system error → hard fail
# Archiwa: ~/.htg2-archives/<branch>/, retencja 60 dni

ARCHIVE_BASE="$HOME/.htg2-archives"

usage() {
  echo "Usage: $0 <worktree-path-or-branch-name>"
  echo ""
  echo "Archives a dirty worktree (tracked patch, untracked tar, git bundle, manifest)"
  echo "then removes the worktree."
  echo ""
  echo "Archives are saved to: $ARCHIVE_BASE/<branch>/"
  exit 1
}

[[ $# -eq 1 ]] || usage

INPUT="$1"
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "ERROR: Not in a git repo"; exit 1; }

# Resolve input to worktree path and branch name
if [[ -d "$INPUT" ]]; then
  WORKTREE_PATH="$INPUT"
  BRANCH=$(cd "$WORKTREE_PATH" && git rev-parse --abbrev-ref HEAD 2>/dev/null) || { echo "ERROR: Cannot determine branch for $INPUT"; exit 1; }
else
  # Input is a branch name — find worktree
  BRANCH="$INPUT"
  WORKTREE_PATH=$(git worktree list --porcelain | awk -v branch="$BRANCH" '
    /^worktree / { wt = substr($0, 10) }
    /^branch refs\/heads\// {
      b = substr($0, 21)
      if (b == branch) { print wt; exit }
    }
  ')
  [[ -n "$WORKTREE_PATH" ]] || { echo "ERROR: No worktree found for branch '$BRANCH'"; exit 1; }
fi

# Sanitize branch name for directory
SAFE_BRANCH=$(echo "$BRANCH" | tr '/' '-')
ARCHIVE_DIR="$ARCHIVE_BASE/$SAFE_BRANCH"

echo "=== Archiving worktree ==="
echo "  Worktree: $WORKTREE_PATH"
echo "  Branch:   $BRANCH"
echo "  Archive:  $ARCHIVE_DIR"
echo ""

mkdir -p "$ARCHIVE_DIR"

cd "$WORKTREE_PATH"

# 1. Patch tracked changes
TRACKED_CHANGES=$(git diff --stat 2>/dev/null | wc -l | tr -d ' ')
STAGED_CHANGES=$(git diff --cached --stat 2>/dev/null | wc -l | tr -d ' ')

if [[ "$TRACKED_CHANGES" -gt 0 ]] || [[ "$STAGED_CHANGES" -gt 0 ]]; then
  echo "[1/4] Creating tracked changes patch..."
  git diff HEAD > "$ARCHIVE_DIR/tracked.patch" || { echo "ERROR: Failed to create patch"; exit 1; }
  echo "  → tracked.patch ($(wc -l < "$ARCHIVE_DIR/tracked.patch") lines)"
else
  echo "[1/4] No tracked changes — skipping patch"
fi

# 2. Tar untracked files
UNTRACKED_FILES=$(git ls-files --others --exclude-standard 2>/dev/null)

if [[ -n "$UNTRACKED_FILES" ]]; then
  echo "[2/4] Creating untracked files archive..."
  git ls-files --others --exclude-standard -z | xargs -0 tar czf "$ARCHIVE_DIR/untracked.tar.gz" 2>/dev/null || { echo "ERROR: Failed to create tar"; exit 1; }
  UNTRACKED_COUNT=$(echo "$UNTRACKED_FILES" | wc -l | tr -d ' ')
  echo "  → untracked.tar.gz ($UNTRACKED_COUNT files)"
else
  echo "[2/4] No untracked files — skipping tar"
fi

# 3. Git bundle (unique commits)
AHEAD=$(git log --oneline "origin/main..$BRANCH" 2>/dev/null | wc -l | tr -d ' ')

if [[ "$AHEAD" -gt 0 ]]; then
  echo "[3/4] Creating git bundle ($AHEAD unique commits)..."
  git bundle create "$ARCHIVE_DIR/commits.bundle" "origin/main..$BRANCH" 2>/dev/null || { echo "ERROR: Failed to create bundle"; exit 1; }
  echo "  → commits.bundle"
else
  echo "[3/4] No unique commits — skipping bundle"
fi

# 4. Manifest
echo "[4/4] Creating manifest..."
BASE_SHA=$(git merge-base origin/main "$BRANCH" 2>/dev/null || echo "unknown")
LAST_AUTHOR=$(git log -1 --format='%an <%ae>' 2>/dev/null || echo "unknown")
# Owner from branch naming convention: ai/<owner>/<tool>/<date>-<goal>
OWNER=$(echo "$BRANCH" | awk -F'/' '{ if (NF >= 3 && $1 == "ai") print $2; else print "unknown" }')

cat > "$ARCHIVE_DIR/manifest.txt" <<EOF
branch: $BRANCH
worktree: $WORKTREE_PATH
owner: $OWNER
last_commit_author: $LAST_AUTHOR (diagnostics only)
archived_at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
base_sha: $BASE_SHA
ahead_of_main: $AHEAD
tracked_patch: $([ -f "$ARCHIVE_DIR/tracked.patch" ] && echo "yes" || echo "no")
untracked_tar: $([ -f "$ARCHIVE_DIR/untracked.tar.gz" ] && echo "yes" || echo "no")
commits_bundle: $([ -f "$ARCHIVE_DIR/commits.bundle" ] && echo "yes" || echo "no")
EOF

echo "  → manifest.txt"

# Verify at least manifest was created
[[ -f "$ARCHIVE_DIR/manifest.txt" ]] || { echo "ERROR: Manifest not created"; exit 1; }

echo ""
echo "=== Archive complete ==="
echo ""

# Ask before removing
read -p "Remove worktree '$WORKTREE_PATH'? [y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  cd "$REPO_ROOT"
  git worktree remove "$WORKTREE_PATH" --force
  echo "Worktree removed."
  echo ""
  echo "To also delete the branch:"
  echo "  git branch -D $BRANCH"
  echo "  git push origin --delete $BRANCH"
else
  echo "Worktree kept. Remove manually when ready:"
  echo "  git worktree remove '$WORKTREE_PATH' --force"
fi
