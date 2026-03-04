import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const EXTRA_ROOT = path.join(PROJECT_ROOT, "backend", "Extra", "APP ROSTROS", "APP ROSTROS");
const OUTPUT_DATASET = path.join(__dirname, "face-shape-dataset.json");
const OUTPUT_SUMMARY = path.join(__dirname, "face-shape-summary.json");

const FACE_SHAPE_MAP = new Map([
  ["alargado", "Rectangular"],
  ["corazon", "Corazon"],
  ["cuadrado", "Cuadrado"],
  ["diamante", "Diamante"],
  ["ovalado", "Ovalado"],
  ["redondo", "Redondo"],
  ["triangular", "Triangular"],
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const FOLDS = 3;

function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function createSeedFromText(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function sortDeterministically(values) {
  return values.slice().sort((a, b) => {
    const hashA = createSeedFromText(a.path);
    const hashB = createSeedFromText(b.path);
    return hashA - hashB || a.path.localeCompare(b.path);
  });
}

function getFaceSamples() {
  const samples = [];

  for (const entry of fs.readdirSync(EXTRA_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const normalizedLabel = FACE_SHAPE_MAP.get(entry.name.toLowerCase());
    if (!normalizedLabel) {
      continue;
    }

    const faceDir = path.join(EXTRA_ROOT, entry.name, "ROSTROS");
    if (!fs.existsSync(faceDir)) {
      continue;
    }

    for (const fileEntry of fs.readdirSync(faceDir, { withFileTypes: true })) {
      if (!fileEntry.isFile()) {
        continue;
      }

      const ext = path.extname(fileEntry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        continue;
      }

      const absolutePath = path.join(faceDir, fileEntry.name);
      const relativePath = path.relative(PROJECT_ROOT, absolutePath);

      samples.push({
        id: `${normalizedLabel}-${fileEntry.name}`.replace(/\s+/g, "-"),
        label: normalizedLabel,
        source_shape: entry.name,
        category: "ROSTROS",
        file_name: fileEntry.name,
        path: normalizePath(relativePath),
        extension: ext,
      });
    }
  }

  return samples;
}

function assignFolds(samples) {
  const byLabel = new Map();
  for (const sample of samples) {
    const current = byLabel.get(sample.label) || [];
    current.push(sample);
    byLabel.set(sample.label, current);
  }

  for (const [label, labelSamples] of byLabel.entries()) {
    const ordered = sortDeterministically(labelSamples);
    ordered.forEach((sample, index) => {
      sample.fold = index % FOLDS;
      sample.training_group = `fold_${sample.fold}`;
    });
    byLabel.set(label, ordered);
  }

  return Array.from(byLabel.values()).flat().sort((a, b) => a.label.localeCompare(b.label) || a.path.localeCompare(b.path));
}

function buildSummary(samples) {
  const labels = [...new Set(samples.map((sample) => sample.label))];
  const classes = {};

  for (const label of labels) {
    const classSamples = samples.filter((sample) => sample.label === label);
    const folds = {};
    for (const sample of classSamples) {
      folds[sample.training_group] = (folds[sample.training_group] || 0) + 1;
    }

    classes[label] = {
      total: classSamples.length,
      folds,
    };
  }

  return {
    generated_at: new Date().toISOString(),
    dataset_root: normalizePath(path.relative(PROJECT_ROOT, EXTRA_ROOT)),
    total_samples: samples.length,
    total_classes: labels.length,
    folds: FOLDS,
    classes,
    warnings: [
      "Dataset pequeno: solo se incluyen imagenes de la carpeta ROSTROS.",
      "Usa validacion cruzada antes de intentar entrenar un modelo definitivo.",
    ],
  };
}

const rawSamples = getFaceSamples();
const samples = assignFolds(rawSamples);
const summary = buildSummary(samples);

fs.writeFileSync(OUTPUT_DATASET, `${JSON.stringify(samples, null, 2)}\n`);
fs.writeFileSync(OUTPUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`);

console.log(`Dataset generado en ${normalizePath(path.relative(PROJECT_ROOT, OUTPUT_DATASET))}`);
console.log(`Resumen generado en ${normalizePath(path.relative(PROJECT_ROOT, OUTPUT_SUMMARY))}`);
console.log(`Muestras totales: ${summary.total_samples}`);

