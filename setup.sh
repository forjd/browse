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

# Step 3: Install browser binaries
echo ""
echo "[3/5] Installing browser binaries..."
bun x patchright install chrome
echo "  ✓ Chrome installed"

# Optional: install additional browsers via BROWSE_BROWSERS env var
# e.g. BROWSE_BROWSERS="firefox webkit" ./setup.sh
if [ -n "$BROWSE_BROWSERS" ]; then
  for EXTRA_BROWSER in $BROWSE_BROWSERS; do
    echo "  Installing $EXTRA_BROWSER..."
    bun x patchright install "$EXTRA_BROWSER"
    echo "  ✓ $EXTRA_BROWSER installed"
  done
fi

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

bun build --compile ./src/cli.ts --outfile dist/browse --external electron --external chromium-bidi

if [ ! -f dist/browse ]; then
  echo "Error: Compilation failed. Check the output above for details."
  exit 1
fi

# Re-sign on macOS — Bun's --compile invalidates the linker signature
if [ "$(uname -s)" = "Darwin" ]; then
  codesign -s - -f dist/browse
  echo "  ✓ ad-hoc signed"
fi

# Copy extensions alongside the binary
for ext in screenxy-fix stealth-worker-fix; do
  if [ -d "extensions/$ext" ]; then
    mkdir -p "dist/extensions/$ext"
    cp "extensions/$ext"/* "dist/extensions/$ext/"
    echo "  ✓ dist/extensions/$ext"
  fi
done

echo "  ✓ dist/browse ($OS-$ARCH_LABEL)"

# Step 5: Create symlink
echo ""
echo "[5/5] Creating symlink..."

# Target: ~/.local/bin/browse by default.
# Override with INSTALL_DIR=/usr/local/bin ./setup.sh when a system PATH entry
# should own the command name.
SYMLINK_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
SYMLINK_PATH="$SYMLINK_DIR/browse"

mkdir -p "$SYMLINK_DIR"

if [ -L "$SYMLINK_PATH" ] || [ -e "$SYMLINK_PATH" ]; then
  rm "$SYMLINK_PATH"
fi

ln -s "$SCRIPT_DIR/dist/browse" "$SYMLINK_PATH"
echo "  ✓ $SYMLINK_PATH → $SCRIPT_DIR/dist/browse"

if ! echo "$PATH" | tr ':' '\n' | grep -q "$SYMLINK_DIR"; then
	echo ""
	echo "Warning: $SYMLINK_DIR is not on your PATH. Add it with:"
	echo "  export PATH=\"$SYMLINK_DIR:\$PATH\""
	echo "Add this to your shell profile (~/.zshrc or ~/.bashrc) to make it permanent."
fi

RESOLVED_BROWSE="$(command -v browse || true)"
if [ -n "$RESOLVED_BROWSE" ] && [ "$RESOLVED_BROWSE" != "$SYMLINK_PATH" ]; then
	echo ""
	echo "Warning: 'browse' currently resolves to:"
	echo "  $RESOLVED_BROWSE"
	echo "not the installed CLI:"
	echo "  $SYMLINK_PATH"
	echo "Run '$SYMLINK_PATH ...', move $SYMLINK_DIR earlier in PATH, or reinstall with INSTALL_DIR set to an earlier PATH directory."
elif [ -z "$RESOLVED_BROWSE" ]; then
	echo ""
	echo "Warning: 'browse' is not currently resolvable from PATH."
	echo "Run '$SYMLINK_PATH ...' or add $SYMLINK_DIR to PATH."
fi

echo ""
echo "Setup complete. Run '$SYMLINK_PATH goto https://example.com' to get started."
