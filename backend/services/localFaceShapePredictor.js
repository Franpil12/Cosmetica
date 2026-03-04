import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_PATH = path.resolve(__dirname, "..", "ml", "face-shape-baseline-model.json");
const FEATURE_SCRIPT_PATH = path.resolve(__dirname, "..", "ml", "extract-single-face-shape-feature.ps1");
const POWERSHELL_PATH = process.env.POWERSHELL_PATH || "powershell";
const TEMP_DIR = path.join(os.tmpdir(), "cosmetica-face-shape");

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

function extractFeatureVector(tempImagePath) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      POWERSHELL_PATH,
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        FEATURE_SCRIPT_PATH,
        "-InputPath",
        tempImagePath,
      ],
      { windowsHide: true },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Feature extraction exited with code ${code}`));
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        if (!Array.isArray(parsed?.vector)) {
          reject(new Error("Feature extraction returned an invalid payload."));
          return;
        }
        resolve(parsed.vector.map((value) => Number(value)));
      } catch (error) {
        reject(error);
      }
    });
  });
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
