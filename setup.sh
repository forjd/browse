#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Step 1: Check prerequisites
echo "[1/5] Checking prerequisites..."

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

echo "  ✓ bun $BUN_VERSION"

# Step 2: Install dependencies
echo ""
echo "[2/5] Installing dependencies..."
bun install --frozen-lockfile 2>/dev/null || bun install
echo "  ✓ Dependencies installed"

# Step 3: Install Playwright browsers
echo ""
echo "[3/5] Installing Playwright browsers..."
bunx playwright install chromium
echo "  ✓ Chromium installed"

# Step 4: Compile binary
echo ""
echo "[4/5] Compiling binary..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalise architecture name
case "$ARCH" in
  x86_64) ARCH_LABEL="x86_64" ;;
  aarch64) ARCH_LABEL="arm64" ;;
  arm64) ARCH_LABEL="arm64" ;;
  *) ARCH_LABEL="$ARCH" ;;
esac

bun build --compile ./src/cli.ts --outfile dist/browse --external electron --external chromium-bidi --external playwright --external playwright-core

if [ ! -f dist/browse ]; then
  echo "Error: Compilation failed. Check the output above for details."
  exit 1
fi

echo "  ✓ dist/browse ($OS-$ARCH_LABEL)"

# Step 5: Create symlink
echo ""
echo "[5/5] Creating symlink..."

# Target: ~/.local/bin/browse
SYMLINK_DIR="$HOME/.local/bin"
SYMLINK_PATH="$SYMLINK_DIR/browse"

mkdir -p "$SYMLINK_DIR"

if [ -L "$SYMLINK_PATH" ] || [ -e "$SYMLINK_PATH" ]; then
  rm "$SYMLINK_PATH"
fi

ln -s "$SCRIPT_DIR/dist/browse" "$SYMLINK_PATH"
echo "  ✓ $SYMLINK_PATH → $SCRIPT_DIR/dist/browse"

if ! echo "$PATH" | tr ':' '\n' | grep -q "$SYMLINK_DIR"; then
  echo ""
  echo "Note: ~/.local/bin is not on your PATH. Add it with:"
  echo "  export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo "Add this to your shell profile (~/.zshrc or ~/.bashrc) to make it permanent."
fi

echo ""
echo "Setup complete. Run 'browse goto https://example.com' to get started."
