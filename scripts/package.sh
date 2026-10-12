#!/bin/sh
# Builds the ZIP to upload to the Chrome Web Store:
# dist/dividendes-goog-fr-<version>.zip, the version read from the manifest.
set -eu
cd "$(dirname "$0")/.."

version=$(node -p "require('./extension/manifest.json').version")
out="dist/dividendes-goog-fr-$version.zip"
mkdir -p dist
rm -f "$out"
(cd extension && zip -qr -X "../$out" .)
echo "$out"
