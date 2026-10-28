#!/usr/bin/env bash
# GARY — repack the Tauri-built .deb with dpkg-deb (Linux only; run after `pnpm tauri build`).
# Tauri writes the .deb's `ar` headers with the builder's raw UID/GID; on machines with large
# (domain/LDAP/SSSD) IDs like 1028801628 they overflow the 6-char field and apt rejects the package
# ("Cabecera de miembro del archivo inválida"). dpkg-deb rebuilds it from Tauri's staging dir with
# root:root ownership. Harmless on normal machines (CI included).
set -euo pipefail
cd "$(dirname "$0")/../src-tauri/target/release/bundle/deb"
for stage in */; do
  stage="${stage%/}"
  [ -d "$stage/control" ] && [ -d "$stage/data" ] || continue
  tmp="$(mktemp -d)"
  cp -a "$stage/data/." "$tmp/"
  mkdir "$tmp/DEBIAN" && cp "$stage/control/"* "$tmp/DEBIAN/"
  dpkg-deb --root-owner-group --build "$tmp" "$stage.deb"
  rm -rf "$tmp"
  echo "[repack-deb] OK → $(pwd)/$stage.deb"
done
