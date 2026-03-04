import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXTRA_ROOT = path.resolve(__dirname, "..", "Extra");
const DATASET_ROOT = path.join(EXTRA_ROOT, "APP ROSTROS", "APP ROSTROS");
const ACCESSORIES_BASE_ROOT = path.resolve(__dirname, "..", "Accessories");
const ACCESSORIES_ROOT = path.join(ACCESSORIES_BASE_ROOT, "APP ROSTROS", "APP ROSTROS");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const FACE_SHAPE_MAP = new Map([
  ["alargado", "Rectangular"],
  ["corazon", "Corazon"],
  ["cuadrado", "Cuadrado"],
  ["diamante", "Diamante"],
  ["ovalado", "Ovalado"],
  ["redondo", "Redondo"],
  ["triangular", "Triangular"],
]);

const ACCESSORY_TYPE_MAP = new Map([
  ["ARETES", { key: "ARETES", label: "Aretes" }],
  ["BUFANDAS", { key: "BUFANDAS", label: "Bufandas" }],
  ["COLLAR", { key: "COLLARES", label: "Collares" }],
  ["DIADEMA", { key: "DIADEMAS", label: "Diademas" }],
  ["GAFAS", { key: "GAFAS", label: "Gafas" }],
  ["SOBRERO", { key: "SOMBREROS", label: "Sombreros" }],
  ["SOMBRERO", { key: "SOMBREROS", label: "Sombreros" }],
]);

const FALLBACK_SHAPE_MAP = new Map([
  ["Triangular", "Cuadrado"],
  ["No definido", "Ovalado"],
  ["Indefinido", "Ovalado"],
]);

const DEFAULT_TYPE_ORDER = {
  Ovalado: ["GAFAS", "ARETES", "COLLARES", "DIADEMAS"],
  Redondo: ["GAFAS", "COLLARES", "SOMBREROS"],
  Cuadrado: ["ARETES", "BUFANDAS", "GAFAS", "SOMBREROS"],
  Rectangular: ["ARETES", "COLLARES", "GAFAS", "SOMBREROS"],
  Corazon: ["COLLARES", "GAFAS", "SOMBREROS"],
  Diamante: ["ARETES", "COLLARES", "GAFAS", "SOMBREROS"],
  Triangular: ["ARETES", "COLLARES", "GAFAS", "SOMBREROS"],
};

function toPublicUrl(filePath, rootPath, publicPrefix) {
  const relativePath = path.relative(rootPath, filePath);
  const safePath = relativePath.split(path.sep).map((segment) => encodeURIComponent(segment)).join("/");
  return `${publicPrefix}/${safePath}`;
}

function listImageFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase()))
    .sort((a, b) => a.localeCompare(b));
}

function buildImageEntries(files, normalizedShape, categoryName, rootPath, publicPrefix) {
  return files.map((filePath, index) => ({
    id: `${normalizedShape}-${categoryName}-${index + 1}`,
    fileName: path.basename(filePath),
    absolutePath: filePath,
    imageUrl: toPublicUrl(filePath, rootPath, publicPrefix),
  }));
}

function readShapeCatalog(shapeDirEntry) {
  const normalizedShape = FACE_SHAPE_MAP.get(shapeDirEntry.name.toLowerCase());
  if (!normalizedShape) {
    return null;
  }

  const shapePath = path.join(DATASET_ROOT, shapeDirEntry.name);
  const referenceFaces = buildImageEntries(
    listImageFiles(path.join(shapePath, "ROSTROS")),
    normalizedShape,
    "ROSTROS",
    EXTRA_ROOT,
    "/catalog-assets/faces",
  );

  const accessoriesShapePath = path.join(ACCESSORIES_ROOT, shapeDirEntry.name);
  const hasDedicatedAccessoriesRoot = fs.existsSync(accessoriesShapePath);
  const categoryRoot = hasDedicatedAccessoriesRoot ? accessoriesShapePath : shapePath;
  const categoryEntries = fs.existsSync(categoryRoot)
    ? fs.readdirSync(categoryRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : [];

  const accessories = {};

  for (const categoryEntry of categoryEntries) {
    if (categoryEntry.name.toUpperCase() === "ROSTROS") {
      continue;
    }

    const typeInfo = ACCESSORY_TYPE_MAP.get(categoryEntry.name.toUpperCase());
    if (!typeInfo) {
      continue;
    }

    const categoryPath = path.join(categoryRoot, categoryEntry.name);
    const files = buildImageEntries(
      listImageFiles(categoryPath),
      normalizedShape,
      categoryEntry.name,
      hasDedicatedAccessoriesRoot ? ACCESSORIES_BASE_ROOT : EXTRA_ROOT,
      hasDedicatedAccessoriesRoot ? "/catalog-assets/accessories" : "/catalog-assets/faces",
    );

    if (!files.length) {
      continue;
    }

    accessories[typeInfo.key] = {
      type: typeInfo.key,
      label: typeInfo.label,
      images: files,
    };
  }

  return {
    shape: normalizedShape,
    sourceFolder: shapeDirEntry.name,
    referenceFaces,
    accessories,
  };
}

function buildCatalog() {
  if (!fs.existsSync(DATASET_ROOT)) {
    return { shapes: {} };
  }

  const shapeEntries = fs.readdirSync(DATASET_ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const shapes = {};

  for (const shapeEntry of shapeEntries) {
    const shapeCatalog = readShapeCatalog(shapeEntry);
    if (shapeCatalog) {
      shapes[shapeCatalog.shape] = shapeCatalog;
    }
  }

  return { shapes };
}

const catalog = buildCatalog();

export function getAccessoryCatalog() {
  return catalog;
}

export function resolveCatalogFaceShape(faceShape) {
  if (catalog.shapes[faceShape]) {
    return faceShape;
  }

  const fallback = FALLBACK_SHAPE_MAP.get(faceShape);
  if (fallback && catalog.shapes[fallback]) {
    return fallback;
  }

  return catalog.shapes.Ovalado ? "Ovalado" : Object.keys(catalog.shapes)[0] || null;
}

export function pickReferenceFace(faceShape) {
  const resolvedShape = resolveCatalogFaceShape(faceShape);
  if (!resolvedShape) {
    return null;
  }

  const shapeCatalog = catalog.shapes[resolvedShape];
  const reference = shapeCatalog.referenceFaces[0];
  if (!reference) {
    return null;
  }

  return {
    ...reference,
    shape: resolvedShape,
    label: `Rostro de referencia ${resolvedShape}`,
  };
}

function normalizePreferredTypes(preferredTypes) {
  if (!Array.isArray(preferredTypes)) {
    return [];
  }

  return preferredTypes
    .map((value) => String(value || "").trim().toUpperCase())
    .map((value) => ACCESSORY_TYPE_MAP.get(value)?.key || value)
    .filter(Boolean);
}

export function pickAccessoryRecommendations(faceShape, preferredTypes = [], limit = 4) {
  const resolvedShape = resolveCatalogFaceShape(faceShape);
  if (!resolvedShape) {
    return [];
  }

  const shapeCatalog = catalog.shapes[resolvedShape];
  const availableTypes = Object.keys(shapeCatalog.accessories);
  const preferred = normalizePreferredTypes(preferredTypes).filter((type) => availableTypes.includes(type));
  const defaults = (DEFAULT_TYPE_ORDER[resolvedShape] || []).filter((type) => availableTypes.includes(type));
  const orderedTypes = [...new Set([...preferred, ...defaults, ...availableTypes])].slice(0, limit);

  return orderedTypes.map((type) => {
    const accessory = shapeCatalog.accessories[type];
    const preview = accessory.images[0];
    return {
      type: accessory.type,
      label: accessory.label,
      shape: resolvedShape,
      image: preview,
      gallerySize: accessory.images.length,
    };
  });
}

export function getCatalogPromptContext() {
  return Object.values(catalog.shapes)
    .map((shapeCatalog) => {
      const accessoryLabels = Object.values(shapeCatalog.accessories).map((item) => item.label).join(", ");
      return `${shapeCatalog.shape}: ${accessoryLabels}`;
    })
    .join(" | ");
}
