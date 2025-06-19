#!/usr/bin/env bash
set -e

# Download sentence-transformers/all-MiniLM-L6-v2 model for offline use
# This script downloads the model files needed by @huggingface/transformers

BASE_DIR="${1:-models}"
MODEL_NAME="sentence-transformers/all-MiniLM-L6-v2"
MODEL_DIR="${BASE_DIR}/${MODEL_NAME}"
BASE_URL="https://huggingface.co/${MODEL_NAME}/resolve/main"

echo "Downloading ${MODEL_NAME} to ${MODEL_DIR}..."

mkdir -p "$MODEL_DIR/onnx"

# Required model files
FILES=(
    "config.json"
    "tokenizer.json"
    "tokenizer_config.json"
    "special_tokens_map.json"
)

# ONNX model files (in onnx subdirectory)
ONNX_FILES=(
    "onnx/model.onnx"
    "onnx/model_quantized.onnx"
)

# Download main config files
for file in "${FILES[@]}"; do
    echo "  Downloading $file..."
    curl -sL "${BASE_URL}/${file}" -o "${MODEL_DIR}/${file}"
done

# Download ONNX model files
for file in "${ONNX_FILES[@]}"; do
    echo "  Downloading $file..."
    curl -sL "${BASE_URL}/${file}" -o "${MODEL_DIR}/${file}"
done

# Verify downloads
echo ""
echo "Verifying downloads..."
MISSING=0
for file in "${FILES[@]}" "${ONNX_FILES[@]}"; do
    if [[ ! -f "${MODEL_DIR}/${file}" ]]; then
        echo "  Missing: ${file}"
        MISSING=$((MISSING + 1))
    fi
done

if [[ $MISSING -eq 0 ]]; then
    echo "All model files downloaded successfully!"
    echo ""
    du -sh "$MODEL_DIR"
else
    echo "Warning: $MISSING file(s) missing"
    exit 1
fi
