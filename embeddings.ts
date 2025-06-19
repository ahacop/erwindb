// Embedding generation module using Transformers.js
import * as ONNX_WEB from "onnxruntime-web";
import { pipeline, env } from "@huggingface/transformers";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getPaths, isDevelopment, ERWINDB_HOME } from "./paths.ts";

// Compute WASM path based on environment
// - Dev mode (bun/deno): use node_modules
// - Compiled binary: use wasm/ in ERWINDB_HOME
const wasmPath = isDevelopment
  ? join(process.cwd(), "node_modules/onnxruntime-web/dist/")
  : join(ERWINDB_HOME, "wasm/");

// Configure ONNX runtime WASM paths directly
ONNX_WEB.env.wasm.wasmPaths = wasmPath;

// Register WASM ONNX runtime globally for transformers.js
const ORT_SYMBOL = Symbol.for("onnxruntime");
// @ts-ignore - Register WASM ONNX runtime globally
globalThis[ORT_SYMBOL] = ONNX_WEB;

// Configure transformers to use local models
const paths = getPaths();
const modelSubdir = "sentence-transformers/all-MiniLM-L6-v2";
const localModelsExist = existsSync(join(paths.models, modelSubdir, "config.json"));

env.localModelPath = paths.models;
env.allowLocalModels = true;
env.allowRemoteModels = !localModelsExist; // Only download if models missing
env.useBrowserCache = false;

// Also configure transformers WASM paths
// @ts-ignore - wasm config exists at runtime
env.backends.onnx.wasm = {
  wasmPaths: wasmPath,
};

// Cache the pipeline instance and loading promise
let embeddingPipeline: any = null;
let loadingPromise: Promise<any> | null = null;

/**
 * Initialize the embedding pipeline (lazy loading)
 * Uses a singleton pattern to ensure only one model is loaded
 */
async function getEmbeddingPipeline() {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  // If already loading, wait for the existing promise
  if (loadingPromise) {
    return loadingPromise;
  }

  // Start loading
  console.log("🔄 Loading embedding model (first run may download ~90MB)...");
  loadingPromise = (async () => {
    embeddingPipeline = await pipeline(
      "feature-extraction",
      "sentence-transformers/all-MiniLM-L6-v2",
      { device: "cpu" }
    );
    console.log("✅ Embedding model loaded");
    loadingPromise = null;
    return embeddingPipeline;
  })();

  return loadingPromise;
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ") // Remove HTML tags
    .replace(/&nbsp;/g, " ") // Replace &nbsp; with space
    .replace(/&amp;/g, "&") // Replace &amp; with &
    .replace(/&lt;/g, "<") // Replace &lt; with <
    .replace(/&gt;/g, ">") // Replace &gt; with >
    .replace(/&quot;/g, '"') // Replace &quot; with "
    .replace(/&#39;/g, "'") // Replace &#39; with '
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Generate embedding for a single text
 * @param text - Input text to embed
 * @returns 384-dimensional embedding as Float32Array
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const pipeline = await getEmbeddingPipeline();

  // Strip HTML if present
  const cleanText = stripHtml(text);

  // Truncate to model's max length (512 tokens ≈ 2000 chars)
  const truncatedText = cleanText.slice(0, 2000);

  // Generate embedding
  const output = await pipeline(truncatedText, {
    pooling: "mean",
    normalize: true,
  });

  // Extract the embedding from the output
  // The output is a Tensor, we need to convert it to Float32Array
  const embedding = Array.from(output.data) as number[];
  return new Float32Array(embedding);
}

/**
 * Generate embeddings for multiple texts
 * @param texts - Array of texts to embed
 * @param onProgress - Optional callback for progress updates
 * @returns Array of 384-dimensional embeddings
 */
export async function batchGenerateEmbeddings(
  texts: string[],
  onProgress?: (current: number, total: number) => void
): Promise<Float32Array[]> {
  const embeddings: Float32Array[] = [];

  for (let i = 0; i < texts.length; i++) {
    const embedding = await generateEmbedding(texts[i]);
    embeddings.push(embedding);
    onProgress?.(i + 1, texts.length);
  }

  return embeddings;
}

/**
 * Serialize embedding to Uint8Array for BLOB storage
 * @param embedding - Float32Array embedding
 * @returns Uint8Array suitable for SQLite BLOB
 */
export function serializeEmbedding(embedding: Float32Array): Uint8Array {
  return new Uint8Array(embedding.buffer);
}

/**
 * Deserialize embedding from Uint8Array BLOB
 * @param blob - Uint8Array from SQLite BLOB
 * @returns Float32Array embedding
 */
export function deserializeEmbedding(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer);
}
