#!/usr/bin/env bash
set -e

INSTALL_DIR="$HOME/.local/share/browse"
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

echo "  ✓ bun $BUN_VERSION"

# Clone or update
if [ -d "$INSTALL_DIR/.git" ]; then
  echo ""
  echo "Updating existing installation..."
  git -C "$INSTALL_DIR" pull --ff-only
else
  rm -rf "$INSTALL_DIR"
  git clone https://github.com/forjd/browse.git "$INSTALL_DIR"
fi

echo "  ✓ Source at $INSTALL_DIR"

# Run setup
cd "$INSTALL_DIR"
bash setup.sh

echo ""
echo "Done. Run 'browse goto https://example.com' to get started."
