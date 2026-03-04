import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FEATURES_PATH = path.join(__dirname, "face-shape-features.json");
const METRICS_PATH = path.join(__dirname, "face-shape-baseline-metrics.json");
const MODEL_PATH = path.join(__dirname, "face-shape-baseline-model.json");
const K = 5;

function loadFeatures() {
  if (!fs.existsSync(FEATURES_PATH)) {
    throw new Error("Primero ejecuta npm run ml:extract-features");
  }

  return JSON.parse(fs.readFileSync(FEATURES_PATH, "utf8"));
}

function euclideanDistance(a, b) {
  let total = 0;
  for (let index = 0; index < a.length; index += 1) {
    const diff = a[index] - b[index];
    total += diff * diff;
  }
  return Math.sqrt(total);
}

function averageVectors(vectors) {
  const length = vectors[0].length;
  const sum = new Array(length).fill(0);

  for (const vector of vectors) {
    for (let index = 0; index < length; index += 1) {
      sum[index] += vector[index];
    }
  }

  return sum.map((value) => value / vectors.length);
}

function initConfusionMatrix(labels) {
  const matrix = {};
  for (const actual of labels) {
    matrix[actual] = {};
    for (const predicted of labels) {
      matrix[actual][predicted] = 0;
    }
  }
  return matrix;
}

function predictKnn(sample, trainSamples, k = K) {
  const scored = trainSamples
    .map((candidate) => ({
      label: candidate.label,
      distance: euclideanDistance(sample.vector, candidate.vector),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(k, trainSamples.length));

  const votes = new Map();
  for (const item of scored) {
    const weight = 1 / (item.distance + 1e-6);
    votes.set(item.label, (votes.get(item.label) || 0) + weight);
  }

  let bestLabel = null;
  let bestScore = -1;
  for (const [label, score] of votes.entries()) {
    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  return {
    label: bestLabel,
    neighbors: scored,
  };
}

function evaluateByFold(samples) {
  const labels = [...new Set(samples.map((sample) => sample.label))].sort();
  const folds = [...new Set(samples.map((sample) => sample.fold))].sort((a, b) => a - b);
  const confusionMatrix = initConfusionMatrix(labels);
  const foldResults = [];
  let total = 0;
  let correct = 0;

  for (const fold of folds) {
    const trainSamples = samples.filter((sample) => sample.fold !== fold);
    const validationSamples = samples.filter((sample) => sample.fold === fold);

    let foldCorrect = 0;
    for (const sample of validationSamples) {
      const prediction = predictKnn(sample, trainSamples, K);
      confusionMatrix[sample.label][prediction.label] += 1;
      total += 1;
      if (prediction.label === sample.label) {
        correct += 1;
        foldCorrect += 1;
      }
    }

    foldResults.push({
      fold,
      train_samples: trainSamples.length,
      validation_samples: validationSamples.length,
      accuracy: validationSamples.length ? foldCorrect / validationSamples.length : 0,
    });
  }

  const perClass = labels.map((label) => {
    const row = confusionMatrix[label];
    const classTotal = Object.values(row).reduce((sum, value) => sum + value, 0);
    const classCorrect = row[label] || 0;
    return {
      label,
      samples: classTotal,
      accuracy: classTotal ? classCorrect / classTotal : 0,
    };
  });

  return {
    labels,
    folds: foldResults,
    overall_accuracy: total ? correct / total : 0,
    total_samples: total,
    confusion_matrix: confusionMatrix,
    per_class: perClass,
  };
}

const featurePayload = loadFeatures();
const samples = Array.isArray(featurePayload.samples) ? featurePayload.samples : [];

if (!samples.length) {
  throw new Error("No hay muestras procesables en face-shape-features.json");
}

const metrics = {
  generated_at: new Date().toISOString(),
  baseline: "weighted-knn-centered-crop-grayscale-32x32",
  image_size: featurePayload.image_size,
  feature_length: featurePayload.feature_length,
  skipped_during_feature_extraction: featurePayload.skipped?.length || 0,
  k_neighbors: K,
  evaluation: evaluateByFold(samples),
};

const grouped = new Map();
for (const sample of samples) {
  const current = grouped.get(sample.label) || [];
  current.push(sample.vector);
  grouped.set(sample.label, current);
}

const model = {
  generated_at: metrics.generated_at,
  baseline: metrics.baseline,
  image_size: featurePayload.image_size,
  feature_length: featurePayload.feature_length,
  labels: [...new Set(samples.map((sample) => sample.label))].sort(),
  k_neighbors: K,
  centroids: Object.fromEntries([...grouped.entries()].map(([label, vectors]) => [label, averageVectors(vectors)])),
};

fs.writeFileSync(METRICS_PATH, `${JSON.stringify(metrics, null, 2)}\n`);
fs.writeFileSync(MODEL_PATH, `${JSON.stringify(model, null, 2)}\n`);

console.log(`Baseline metrics generated at backend/ml/face-shape-baseline-metrics.json`);
console.log(`Baseline model generated at backend/ml/face-shape-baseline-model.json`);
console.log(`Overall accuracy: ${(metrics.evaluation.overall_accuracy * 100).toFixed(2)}%`);
