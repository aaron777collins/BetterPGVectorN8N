#!/bin/sh
set -e
# Auto-install community nodes on startup
# Add packages to PACKAGES to have them installed automatically

PACKAGES="n8n-nodes-pgvector-advanced"
NODES_DIR="/home/node/.n8n/nodes"

mkdir -p "$NODES_DIR"
cd "$NODES_DIR"

# Initialize npm if package.json doesn't exist
if [ ! -f "package.json" ]; then
    npm init -y > /dev/null 2>&1
fi

# Install each package if not present
for pkg in $PACKAGES; do
    if [ ! -d "node_modules/$pkg" ]; then
        echo "Installing community node: $pkg"
        npm install "$pkg" --save
    else
        echo "Community node $pkg already installed"
    fi
done
