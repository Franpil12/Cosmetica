import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_PATH = path.resolve(__dirname, "..", "ml", "face-shape-baseline-model.json");
const TEMP_DIR = path.join(os.tmpdir(), "cosmetica-face-shape");
const IMAGE_SIZE = 32;

const model = fs.existsSync(MODEL_PATH)
  ? JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"))
  : null;

function euclideanDistance(vectorA, vectorB) {
  let sum = 0;
  const size = Math.min(vectorA.length, vectorB.length);
  for (let index = 0; index < size; index += 1) {
    const delta = Number(vectorA[index] || 0) - Number(vectorB[index] || 0);
    sum += delta * delta;
  }
  return Math.sqrt(sum);
}

function buildScores(vector) {
  const labels = Array.isArray(model?.labels) ? model.labels : [];
  const centroids = model?.centroids || {};

  return labels
    .filter((label) => Array.isArray(centroids[label]))
    .map((label) => ({
      label,
      distance: euclideanDistance(vector, centroids[label]),
    }))
    .sort((left, right) => left.distance - right.distance);
}

function buildConfidence(best, runnerUp) {
  if (!best) return 0;
  if (!runnerUp) return 0.5;

  const margin = Math.max(0, runnerUp.distance - best.distance);
  const normalizedMargin = margin / Math.max(runnerUp.distance, 1e-9);
  return Math.max(0, Math.min(0.99, Number(normalizedMargin.toFixed(4))));
}

async function extractFeatureVector(tempImagePath) {
  const { data } = await sharp(tempImagePath)
    .resize(IMAGE_SIZE, IMAGE_SIZE, {
      fit: "cover",
      position: "centre",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grayscale = [];
  const rowMeans = new Array(IMAGE_SIZE).fill(0);
  const columnMeans = new Array(IMAGE_SIZE).fill(0);

  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      const pixelIndex = (y * IMAGE_SIZE + x) * 3;
      const red = data[pixelIndex];
      const green = data[pixelIndex + 1];
      const blue = data[pixelIndex + 2];
      const gray = ((red * 0.299) + (green * 0.587) + (blue * 0.114)) / 255;
      const rounded = Number(gray.toFixed(6));

      grayscale.push(rounded);
      rowMeans[y] += gray;
      columnMeans[x] += gray;
    }
  }

  for (let index = 0; index < IMAGE_SIZE; index += 1) {
    rowMeans[index] = Number((rowMeans[index] / IMAGE_SIZE).toFixed(6));
    columnMeans[index] = Number((columnMeans[index] / IMAGE_SIZE).toFixed(6));
  }

  const features = [...grayscale, ...rowMeans, ...columnMeans];
  const mean = features.reduce((sum, value) => sum + value, 0) / features.length;
  const variance = features.reduce((sum, value) => {
    const delta = value - mean;
    return sum + (delta * delta);
  }, 0) / features.length;
  const stdDev = Math.sqrt(variance) || 1;

  return features.map((value) => Number((((value - mean) / stdDev)).toFixed(6)));
}

export async function predictLocalFaceShapeFromBuffer(buffer, mimeType = "image/jpeg") {
  if (!model) {
    return null;
  }

  const extension = mimeType === "image/png"
    ? ".png"
    : mimeType === "image/webp"
      ? ".webp"
      : ".jpg";

  await fs.promises.mkdir(TEMP_DIR, { recursive: true });
  const tempImagePath = path.join(TEMP_DIR, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`);

  try {
    await fs.promises.writeFile(tempImagePath, buffer);
    const vector = await extractFeatureVector(tempImagePath);
    const scores = buildScores(vector);
    const [best, runnerUp, third] = scores;
    const confidence = buildConfidence(best, runnerUp);

    return {
      face_shape: best?.label || null,
      confidence,
      baseline: model.baseline || "local-baseline",
      top_matches: [best, runnerUp, third].filter(Boolean).map((item) => ({
        face_shape: item.label,
        distance: Number(item.distance.toFixed(4)),
      })),
    };
  } finally {
    await fs.promises.rm(tempImagePath, { force: true }).catch(() => {});
  }
}
