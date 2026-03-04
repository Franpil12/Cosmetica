import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inboxRoot = path.join(__dirname, "inbox");
const outputPath = path.join(__dirname, "face-shape-inbox-report.json");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const REQUIRED_CLASSES = [
  "Ovalado",
  "Redondo",
  "Cuadrado",
  "Rectangular",
  "Corazon",
  "Diamante",
  "Triangular",
];

function hasSuspiciousName(name) {
  return /\s/.test(name) || /[^a-zA-Z0-9._-]/.test(name);
}

if (!fs.existsSync(inboxRoot)) {
  throw new Error("No existe backend/ml/inbox");
}

const report = {
  generated_at: new Date().toISOString(),
  inbox_root: "backend/ml/inbox",
  classes: {},
  warnings: [],
};

for (const label of REQUIRED_CLASSES) {
  const classDir = path.join(inboxRoot, label);
  const result = {
    samples: 0,
    invalid_files: [],
    suspicious_names: [],
  };

  if (!fs.existsSync(classDir)) {
    report.warnings.push(`Falta la carpeta de inbox para ${label}`);
    report.classes[label] = result;
    continue;
  }

  for (const entry of fs.readdirSync(classDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === ".gitkeep") {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      result.invalid_files.push(entry.name);
      continue;
    }

    result.samples += 1;
    if (hasSuspiciousName(entry.name)) {
      result.suspicious_names.push(entry.name);
    }
  }

  report.classes[label] = result;
}

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Reporte generado en backend/ml/face-shape-inbox-report.json`);
