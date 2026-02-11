// Embedding generation module using Transformers.js (Deno)
import { pipeline, env } from "npm:@huggingface/transformers@3";

// Let transformers.js handle model caching automatically
env.useBrowserCache = false;

// Cache the pipeline instance
let embeddingPipeline: any = null;
let loadingPromise: Promise<any> | null = null;

async function getEmbeddingPipeline() {
  if (embeddingPipeline) {
    return embeddingPipeline;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

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

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateEmbedding(text: string): Promise<Float32Array> {
  const pipe = await getEmbeddingPipeline();
  const cleanText = stripHtml(text).slice(0, 2000);

  const output = await pipe(cleanText, {
    pooling: "mean",
    normalize: true,
  });

  return new Float32Array(Array.from(output.data) as number[]);
}

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

export function serializeEmbedding(embedding: Float32Array): Uint8Array {
  return new Uint8Array(embedding.buffer);
}

export function deserializeEmbedding(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer);
}
