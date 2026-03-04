import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DATASET_PATH = path.join(__dirname, "face-shape-dataset.json");
const OUTPUT_PATH = path.join(__dirname, "face-shape-features.json");
const IMAGE_SIZE = 32;

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function extractFeatureVector(absolutePath, size = IMAGE_SIZE) {
  const { data } = await sharp(absolutePath)
    .resize(size, size, {
      fit: "cover",
      position: "centre",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const grayscale = [];
  const rowMeans = new Array(size).fill(0);
  const columnMeans = new Array(size).fill(0);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixelIndex = (y * size + x) * 3;
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

  for (let index = 0; index < size; index += 1) {
    rowMeans[index] = Number((rowMeans[index] / size).toFixed(6));
    columnMeans[index] = Number((columnMeans[index] / size).toFixed(6));
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

function loadDataset() {
  if (!fs.existsSync(DATASET_PATH)) {
    throw new Error("Primero ejecuta npm run dataset:build");
  }

  return JSON.parse(fs.readFileSync(DATASET_PATH, "utf8"));
}

async function main() {
  const dataset = loadDataset();
  const samples = [];
  const skipped = [];

  for (const item of dataset) {
    const absolutePath = path.resolve(PROJECT_ROOT, item.path);

    try {
      const vector = await extractFeatureVector(absolutePath, IMAGE_SIZE);
      samples.push({
        id: item.id,
        label: item.label,
        path: item.path,
        fold: item.fold,
        training_group: item.training_group,
        vector,
      });
    } catch (error) {
      skipped.push({
        id: item.id,
        path: item.path,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const featureLength = samples.length ? samples[0].vector.length : 0;
  const output = {
    generated_at: new Date().toISOString(),
    image_size: IMAGE_SIZE,
    feature_length: featureLength,
    total_input_samples: dataset.length,
    total_output_samples: samples.length,
    extractor: "sharp-centered-crop-grayscale-32x32",
    skipped,
    samples,
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log("Features generated at backend/ml/face-shape-features.json");
  console.log(`Usable samples: ${samples.length}`);
  console.log(`Skipped samples: ${skipped.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
