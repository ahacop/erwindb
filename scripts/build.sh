#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

VERSION=${1:-$(jq -r .version "$PROJECT_DIR/package.json")}
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalize architecture names
[[ "$ARCH" == "x86_64" ]] && ARCH="x64"
[[ "$ARCH" == "aarch64" ]] && ARCH="arm64"

BUILD_DIR="dist/erwindb-${VERSION}-${PLATFORM}-${ARCH}"

echo "Building ErwinDB ${VERSION} for ${PLATFORM}-${ARCH}..."

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"/{lib,models,data,wasm}

# Build binary
echo "Compiling binary..."
bun build --compile "$PROJECT_DIR/tui.tsx" --outfile "$BUILD_DIR/erwindb"

# Copy sqlite-vec extension
echo "Copying sqlite-vec extension..."
EXT=$([[ "$PLATFORM" == "darwin" ]] && echo "dylib" || echo "so")

# Find the sqlite-vec binary in node_modules
SQLITE_VEC_DIR="$PROJECT_DIR/node_modules/sqlite-vec-${PLATFORM}-${ARCH}"
if [[ ! -d "$SQLITE_VEC_DIR" ]]; then
    # Try alternative naming convention
    SQLITE_VEC_DIR="$PROJECT_DIR/node_modules/@anthropic/sqlite-vec-${PLATFORM}-${ARCH}"
fi

if [[ -d "$SQLITE_VEC_DIR" ]]; then
    cp "$SQLITE_VEC_DIR/vec0.${EXT}" "$BUILD_DIR/lib/" 2>/dev/null || \
    cp "$SQLITE_VEC_DIR/"*.${EXT} "$BUILD_DIR/lib/vec0.${EXT}" 2>/dev/null || \
    echo "Warning: Could not find sqlite-vec extension in $SQLITE_VEC_DIR"
else
    echo "Warning: sqlite-vec directory not found at $SQLITE_VEC_DIR"
    echo "You may need to manually copy the sqlite-vec extension to $BUILD_DIR/lib/"
fi

# Copy ONNX WASM files
echo "Copying ONNX WASM files..."
WASM_SRC="$PROJECT_DIR/node_modules/onnxruntime-web/dist"
if [[ -d "$WASM_SRC" ]]; then
    cp "$WASM_SRC"/ort-wasm*.wasm "$BUILD_DIR/wasm/" 2>/dev/null || true
    cp "$WASM_SRC"/ort-wasm*.mjs "$BUILD_DIR/wasm/" 2>/dev/null || true
else
    echo "Warning: ONNX WASM files not found at $WASM_SRC"
fi

# Copy models from repo (download if missing)
echo "Copying ML models..."
if [[ ! -f "$PROJECT_DIR/models/sentence-transformers/all-MiniLM-L6-v2/config.json" ]]; then
    echo "Models not found, downloading..."
    "$SCRIPT_DIR/download-models.sh" "$PROJECT_DIR/models"
fi
cp -r "$PROJECT_DIR/models/"* "$BUILD_DIR/models/"

# Copy database
echo "Copying database..."
if [[ -f "$PROJECT_DIR/erwin_stackoverflow.db" ]]; then
    cp "$PROJECT_DIR/erwin_stackoverflow.db" "$BUILD_DIR/data/"
else
    echo "Warning: Database not found at $PROJECT_DIR/erwin_stackoverflow.db"
    echo "You may need to run the scraper first or manually copy the database."
fi

# Create tarball
echo "Creating tarball..."
(cd dist && tar -czvf "erwindb-${VERSION}-${PLATFORM}-${ARCH}.tar.gz" "erwindb-${VERSION}-${PLATFORM}-${ARCH}")

echo ""
echo "Build complete!"
echo "Output: dist/erwindb-${VERSION}-${PLATFORM}-${ARCH}.tar.gz"
echo ""
echo "To test:"
echo "  cd $BUILD_DIR"
echo "  ./erwindb --check"
