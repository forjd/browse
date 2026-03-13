#!/usr/bin/env bash
set -e

REPO="forjd/browse"
BIN_DIR="$HOME/.local/bin"

echo "Installing browse..."
echo ""

# Check prerequisites
if ! command -v bun &>/dev/null; then
  echo "Error: bun is not installed. Install it with: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

BUN_VERSION=$(bun --version)
BUN_MAJOR=$(echo "$BUN_VERSION" | cut -d. -f1)

if [ "$BUN_MAJOR" -lt 1 ]; then
  echo "Error: bun >= 1.0 required, found $BUN_VERSION"
  exit 1
fi

echo "  bun $BUN_VERSION"

# Detect platform
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
  x86_64)  ARCH_LABEL="x86_64" ;;
  aarch64) ARCH_LABEL="arm64" ;;
  arm64)   ARCH_LABEL="arm64" ;;
  *)
    echo "Error: unsupported architecture: $ARCH"
    exit 1
    ;;
esac

ARTIFACT="browse-${OS}-${ARCH_LABEL}"
echo "  platform: ${OS}-${ARCH_LABEL}"

# Fetch latest release tag
TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' | head -1 | cut -d'"' -f4)

if [ -z "$TAG" ]; then
  echo "Error: could not determine latest release. Check https://github.com/${REPO}/releases"
  exit 1
fi

echo "  release: $TAG"

# Download binary
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ARTIFACT}"
mkdir -p "$BIN_DIR"

echo ""
echo "Downloading ${ARTIFACT}..."

if ! curl -fSL --progress-bar -o "${BIN_DIR}/browse" "$DOWNLOAD_URL"; then
  echo ""
  echo "Error: failed to download binary."
  echo "Available binaries for ${TAG}: https://github.com/${REPO}/releases/tag/${TAG}"
  exit 1
fi

chmod +x "${BIN_DIR}/browse"
echo "  binary: ${BIN_DIR}/browse"

# Install Playwright Chromium
echo ""
echo "Installing Chromium..."
bunx playwright install chromium
echo "  Chromium installed"

# Check PATH
if ! echo "$PATH" | tr ':' '\n' | grep -q "$BIN_DIR"; then
  echo ""
  echo "Note: ~/.local/bin is not on your PATH. Add it with:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc) to make it permanent."
fi

echo ""
echo "Done. Run 'browse goto https://example.com' to get started."
