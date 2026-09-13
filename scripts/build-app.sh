#!/bin/bash
#
# Build AgentForge Debug and install the release .app into /Applications.
#
# Steps:
#   1. npm run build        Build the Vite frontend
#   2. npm run tauri build  Compile the Rust release binary + bundle the .app
#   3. Copy the bundled .app to /Applications (replacing any existing)
#
# The build is unsigned. On first launch clear the quarantine flag:
#   xattr -dr com.apple.quarantine "/Applications/AgentForge Debug.app"
#
# Writing to /Applications may require admin rights:
#   sudo scripts/build-app.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_NAME="AgentForge Debug.app"
BUNDLE_APP="${PROJECT_ROOT}/src-tauri/target/release/bundle/macos/${APP_NAME}"
DEST_DIR="/Applications"
DEST_APP="${DEST_DIR}/${APP_NAME}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd "${PROJECT_ROOT}"

echo -e "${YELLOW}[1/3]${NC} building frontend (npm run build)"
npm run build

echo -e "${YELLOW}[2/3]${NC} building Tauri release bundle (npm run tauri build)"
npm run tauri build

if [ ! -d "${BUNDLE_APP}" ]; then
    echo -e "${RED}[error]${NC} bundle not found: ${BUNDLE_APP}"
    exit 1
fi

echo -e "${YELLOW}[3/3]${NC} installing to ${DEST_APP}"
mkdir -p "${DEST_DIR}"
rm -rf "${DEST_APP}"
cp -R "${BUNDLE_APP}" "${DEST_APP}"

echo -e "${GREEN}[OK]${NC} installed ${APP_NAME}"
echo "     source: ${BUNDLE_APP}"
echo "     dest:   ${DEST_APP}"
