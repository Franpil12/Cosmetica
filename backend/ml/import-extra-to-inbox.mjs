import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const IMPORT_SOURCE_ROOT = path.join(__dirname, "import-source");
const INBOX_ROOT = path.join(__dirname, "inbox");
const REPORT_PATH = path.join(__dirname, "face-shape-import-report.json");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const SHAPE_ALIASES = new Map([
  ["alargado", "Rectangular"],
  ["alargada", "Rectangular"],
  ["rectangular", "Rectangular"],
  ["corazon", "Corazon"],
  ["corazón", "Corazon"],
  ["cuadrado", "Cuadrado"],
  ["cuandrado", "Cuadrado"],
  ["diamante", "Diamante"],
  ["ovalado", "Ovalado"],
  ["ovaldo", "Ovalado"],
  ["redondo", "Redondo"],
  ["triangular", "Triangular"],
  ["triangulo", "Triangular"],
  ["triángulo", "Triangular"],
]);

const IGNORED_SEGMENTS = new Set([
  "hombres",
  "mujeres",
  "rostros",
  "caras",
]);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function walk(dirPath, filePaths = []) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, filePaths);
      continue;
    }

    if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

function inferShape(parts) {
  for (const part of parts) {
    const normalized = normalizeText(part);
    if (!normalized || IGNORED_SEGMENTS.has(normalized)) {
      continue;
    }

    const direct = SHAPE_ALIASES.get(normalized);
    if (direct) {
      return direct;
    }

    for (const [alias, label] of SHAPE_ALIASES.entries()) {
      if (normalized.includes(alias)) {
        return label;
      }
    }
  }

  return null;
}

function buildTargetName(label, relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  const base = safeName(relativePath.replace(/[\\/]+/g, "__").replace(path.extname(relativePath), ""));
  return `${label}__${base}${ext}`;
}

ensureDir(IMPORT_SOURCE_ROOT);
ensureDir(INBOX_ROOT);

const report = {
  generated_at: new Date().toISOString(),
  scanned_root: "backend/ml/import-source",
  imported: [],
  skipped_existing: [],
  unresolved: [],
};

const imagePaths = walk(IMPORT_SOURCE_ROOT);

for (const absolutePath of imagePaths) {
  const relativePath = path.relative(PROJECT_ROOT, absolutePath);
  const parts = relativePath.split(path.sep);
  const fileName = path.basename(absolutePath);
  const fileBase = path.basename(absolutePath, path.extname(absolutePath));
  const inferredLabel = inferShape([...parts, fileName, fileBase]);

  if (!inferredLabel) {
    report.unresolved.push(relativePath);
    continue;
  }

  const targetDir = path.join(INBOX_ROOT, inferredLabel);
  ensureDir(targetDir);

  const targetName = buildTargetName(inferredLabel, relativePath);
  const targetPath = path.join(targetDir, targetName);

  if (fs.existsSync(targetPath)) {
    report.skipped_existing.push({
      label: inferredLabel,
      source: relativePath,
      target: path.relative(PROJECT_ROOT, targetPath),
    });
    continue;
  }

  fs.copyFileSync(absolutePath, targetPath);
  report.imported.push({
    label: inferredLabel,
    source: relativePath,
    target: path.relative(PROJECT_ROOT, targetPath),
  });
}

fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Importacion completada: ${report.imported.length} archivo(s) copiado(s) al inbox.`);
console.log(`Saltados por existir ya en destino: ${report.skipped_existing.length}`);
console.log(`Sin clasificar: ${report.unresolved.length}`);
