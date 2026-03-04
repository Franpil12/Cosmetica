import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendRoot = path.resolve(__dirname, "..");
const outputPath = path.join(frontendRoot, "assets", "js", "runtime-config.js");
const apiBaseUrl = String(process.env.PUBLIC_API_BASE_URL || "").trim().replace(/\/+$/, "");

const contents = `window.APP_CONFIG = {
  ...(window.APP_CONFIG || {}),
  API_BASE_URL: ${JSON.stringify(apiBaseUrl)},
};
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, contents, "utf8");

console.log(`Generated runtime config at ${outputPath}`);
