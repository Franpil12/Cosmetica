import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import analysisRoutes from "./routes/analysis.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

const app = express();
const port = parseInt(process.env.PORT || "3000", 10);
const webRoot = path.resolve(__dirname, "..", "frontend");
const extraRoot = path.resolve(__dirname, "Extra");
const accessoriesRoot = path.resolve(__dirname, "Accessories");
const allowFrontendServe = process.env.SERVE_FRONTEND !== "false" && fs.existsSync(webRoot);
const allowedOrigins = String(process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use((req, res, next) => {
  const requestOrigin = req.headers.origin;
  const shouldAllowAnyOrigin = !allowedOrigins.length;
  const isAllowedOrigin = requestOrigin && allowedOrigins.includes(requestOrigin);

  if (shouldAllowAnyOrigin && requestOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  } else if (isAllowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", requestOrigin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: "2mb" }));
app.use("/api", analysisRoutes);
app.use("/catalog-assets/faces", express.static(extraRoot));
app.use("/catalog-assets/accessories", express.static(accessoriesRoot));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "cosmetica-backend" });
});

if (allowFrontendServe) {
  app.use(express.static(webRoot));
  app.get("/", (_req, res) => {
    res.sendFile(path.join(webRoot, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "cosmetica-backend" });
  });
}

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
