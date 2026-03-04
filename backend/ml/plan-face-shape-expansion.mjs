import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const summaryPath = path.join(__dirname, "face-shape-summary.json");
const outputPath = path.join(__dirname, "face-shape-expansion-plan.json");

const TARGET_PER_CLASS = 60;
const REQUIRED_CLASSES = [
  "Ovalado",
  "Redondo",
  "Cuadrado",
  "Rectangular",
  "Corazon",
  "Diamante",
  "Triangular",
];

if (!fs.existsSync(summaryPath)) {
  throw new Error("Primero ejecuta npm run dataset:build para generar face-shape-summary.json");
}

const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const classes = summary.classes || {};

const plan = REQUIRED_CLASSES.map((label) => {
  const current = classes[label]?.total || 0;
  const missing = Math.max(TARGET_PER_CLASS - current, 0);

  return {
    label,
    current_samples: current,
    target_samples: TARGET_PER_CLASS,
    missing_samples: missing,
    priority: current === 0 ? "critical" : missing >= 45 ? "high" : missing >= 25 ? "medium" : "low",
  };
}).sort((a, b) => b.missing_samples - a.missing_samples || a.label.localeCompare(b.label));

const output = {
  generated_at: new Date().toISOString(),
  target_per_class: TARGET_PER_CLASS,
  total_current_samples: summary.total_samples || 0,
  total_missing_samples: plan.reduce((total, item) => total + item.missing_samples, 0),
  classes: plan,
  collection_rules: [
    "Solo usar rostro frontal o casi frontal.",
    "Evitar filtros, stickers, textos y marcos.",
    "Evitar duplicados de la misma persona en la misma pose.",
    "Mantener iluminacion uniforme y rostro visible completo.",
    "Etiquetar manualmente antes de mover al dataset principal.",
  ],
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Plan generado en backend/ml/face-shape-expansion-plan.json`);
