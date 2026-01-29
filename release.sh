#!/usr/bin/env bash
set -euo pipefail

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit/stash your changes first." >&2
  git status --porcelain >&2
  exit 2
fi

node --input-type=module -e 'import fs from "node:fs";
const pkgPath = "package.json";
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const v = String(pkg.version ?? "0.0.0");
const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) throw new Error(`Invalid version in package.json: ${v}`);
const major = Number(m[1]);
const minor = Number(m[2]);
const patch = Number(m[3]) + 1;
pkg.version = `${major}.${minor}.${patch}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
'

VERSION=$(node --input-type=module -e 'import fs from "node:fs"; const pkg = JSON.parse(fs.readFileSync("package.json","utf8")); process.stdout.write(String(pkg.version));')

git add package.json
git commit -m "chore(release): bump version to ${VERSION}"
git push

LOCAL_IMAGE="pravatv_speed"
REMOTE_IMAGE="docker.klik.cc/pravatv_speed"

docker build --pull --no-cache -t "${LOCAL_IMAGE}:${VERSION}" .
docker tag "${LOCAL_IMAGE}:${VERSION}" "${LOCAL_IMAGE}:latest"

docker tag "${LOCAL_IMAGE}:${VERSION}" "${REMOTE_IMAGE}:${VERSION}"
docker tag "${LOCAL_IMAGE}:${VERSION}" "${REMOTE_IMAGE}:latest"

docker push "${REMOTE_IMAGE}:${VERSION}"
docker push "${REMOTE_IMAGE}:latest"

echo "Released pravatv_speed version ${VERSION}"
