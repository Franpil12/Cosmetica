import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const INBOX_ROOT = path.join(__dirname, "inbox");
const DATASET_ROOT = path.join(PROJECT_ROOT, "backend", "Extra", "APP ROSTROS", "APP ROSTROS");
const REPORT_PATH = path.join(__dirname, "face-shape-promote-report.json");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const CLASS_TO_FOLDER = new Map([
  ["Ovalado", "ovalado"],
  ["Redondo", "redondo"],
  ["Cuadrado", "cuadrado"],
  ["Rectangular", "alargado"],
  ["Corazon", "corazon"],
  ["Diamante", "diamante"],
  ["Triangular", "triangular"],
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name !== ".gitkeep")
    .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()));
}

const report = {
  generated_at: new Date().toISOString(),
  moved: [],
  skipped_existing: [],
  missing_class_dirs: [],
};

for (const [label, folderName] of CLASS_TO_FOLDER.entries()) {
  const inboxDir = path.join(INBOX_ROOT, label);
  const targetDir = path.join(DATASET_ROOT, folderName, "ROSTROS");

  if (!fs.existsSync(inboxDir)) {
    report.missing_class_dirs.push(label);
    continue;
  }

  ensureDir(targetDir);

  for (const fileName of listFiles(inboxDir)) {
    const sourcePath = path.join(inboxDir, fileName);
    const targetPath = path.join(targetDir, fileName);

    if (fs.existsSync(targetPath)) {
      report.skipped_existing.push({
        label,
        source: path.relative(PROJECT_ROOT, sourcePath),
        target: path.relative(PROJECT_ROOT, targetPath),
      });
      continue;
    }

    fs.renameSync(sourcePath, targetPath);
    report.moved.push({
      label,
      source: path.relative(PROJECT_ROOT, sourcePath),
      target: path.relative(PROJECT_ROOT, targetPath),
    });
  }
}

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Promocion completada: ${report.moved.length} archivo(s) movido(s) al dataset principal.`);
console.log(`Saltados por existir ya en destino: ${report.skipped_existing.length}`);
