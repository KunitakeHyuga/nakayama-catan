#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${1:-https://github.com/bcollazo/catanatron.git}"
REF="${2:-master}"
SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DEST_DIR="$ROOT_DIR/catanatron-src"

if [ -d "$DEST_DIR/.git" ]; then
  echo "catanatron-src already contains a Git checkout. Remove it first if you want to fetch again." >&2
  exit 0
fi

if [ -n "$(ls -A "$DEST_DIR" 2>/dev/null)" ]; then
  echo "catanatron-src is not empty. Remove or rename it before running this script." >&2
  exit 1
fi

echo "Cloning $REPO_URL@$REF into $DEST_DIR"

git clone --branch "$REF" --depth 1 "$REPO_URL" "$DEST_DIR"
