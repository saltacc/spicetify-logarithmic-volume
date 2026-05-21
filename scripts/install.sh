#!/usr/bin/env bash
set -euo pipefail

extension_file="logarithmic-volume.js"

if [[ -n "${SPICETIFY_BIN:-}" ]]; then
  spicetify_bin="$SPICETIFY_BIN"
elif command -v spicetify >/dev/null 2>&1; then
  spicetify_bin="spicetify"
elif [[ -x "${HOME}/.spicetify/spicetify" ]]; then
  spicetify_bin="${HOME}/.spicetify/spicetify"
else
  printf 'spicetify was not found on PATH or at %s/.spicetify/spicetify.\n' "$HOME" >&2
  printf 'Set SPICETIFY_BIN=/path/to/spicetify and rerun this script.\n' >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
userdata_dir="$("$spicetify_bin" path userdata)"
extensions_dir="${userdata_dir}/Extensions"

mkdir -p "$extensions_dir"
cp "${repo_root}/${extension_file}" "${extensions_dir}/${extension_file}"

"$spicetify_bin" config extensions "$extension_file"
"$spicetify_bin" apply

printf 'Installed %s to %s\n' "$extension_file" "$extensions_dir"
