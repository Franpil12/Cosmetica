import express from "express";
import multer from "multer";

import {
  getCatalogPromptContext,
  pickAccessoryRecommendations,
  pickReferenceFace,
  resolveCatalogFaceShape,
} from "../services/accessoryCatalog.js";
import { predictLocalFaceShapeFromBuffer } from "../services/localFaceShapePredictor.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
const DEFAULT_TIMEOUT_MS = 25000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const VALID_FACE_SHAPES = new Set([
  "Ovalado",
  "Redondo",
  "Cuadrado",
  "Rectangular",
  "Corazon",
  "Diamante",
  "Triangular",
]);
const VALID_ACCESSORY_TYPES = new Set(["ARETES", "BUFANDAS", "COLLARES", "DIADEMAS", "GAFAS", "SOMBREROS"]);

function normalizeFaceShape(value) {
  if (typeof value !== "string") return "Indefinido";
  const raw = value.trim().toLowerCase();
  if (!raw) return "Indefinido";

  const aliasMap = new Map([
    ["ovalado", "Ovalado"],
    ["oval", "Ovalado"],
    ["redondo", "Redondo"],
    ["redonda", "Redondo"],
    ["cuadrado", "Cuadrado"],
    ["cuadrada", "Cuadrado"],
    ["rectangular", "Rectangular"],
    ["alargado", "Rectangular"],
    ["alargada", "Rectangular"],
    ["corazon", "Corazon"],
    ["corazón", "Corazon"],
    ["triangulo invertido", "Corazon"],
    ["triángulo invertido", "Corazon"],
    ["diamante", "Diamante"],
    ["rombo", "Diamante"],
    ["triangular", "Triangular"],
    ["triangulo", "Triangular"],
    ["triángulo", "Triangular"],
    ["pera", "Triangular"],
    ["indefinido", "Ovalado"],
    ["no definido", "Ovalado"],
    ["no se puede determinar", "Ovalado"],
  ]);

  const normalized = aliasMap.get(raw) || "Ovalado";
  return VALID_FACE_SHAPES.has(normalized) ? normalized : "Ovalado";
}

function normalizeAccessoryType(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;

  const aliasMap = new Map([
    ["ARETE", "ARETES"],
    ["ARETES", "ARETES"],
    ["BUFANDA", "BUFANDAS"],
    ["BUFANDAS", "BUFANDAS"],
    ["COLLAR", "COLLARES"],
    ["COLLARES", "COLLARES"],
    ["DIADEMA", "DIADEMAS"],
    ["DIADEMAS", "DIADEMAS"],
    ["GAFA", "GAFAS"],
    ["GAFAS", "GAFAS"],
    ["LENTES", "GAFAS"],
    ["SOBRERO", "SOMBREROS"],
    ["SOMBRERO", "SOMBREROS"],
    ["SOMBREROS", "SOMBREROS"],
    ["GORRO", "SOMBREROS"],
    ["GORROS", "SOMBREROS"],
  ]);

  const normalized = aliasMap.get(raw) || raw;
  return VALID_ACCESSORY_TYPES.has(normalized) ? normalized : null;
}

function fallbackAnalysis() {
  return {
    face_shape: "No definido",
    style_summary: "No fue posible extraer un analisis estructurado. Intenta con otra foto mas clara y frontal.",
    recommendations: [
      "Usa luz frontal uniforme para mejorar la lectura del rostro.",
      "Evita filtros fuertes y angulos extremos.",
      "Prueba accesorios suaves y proporcionales a tus facciones.",
    ],
    accessory_focus: ["GAFAS", "ARETES"],
  };
}

function buildLocalOnlyAnalysis(localPrediction) {
  const resolvedShape = normalizeFaceShape(localPrediction?.face_shape || "Ovalado");
  const confidence = Number(localPrediction?.confidence || 0);
  const confidenceLabel = confidence > 0 ? `${(confidence * 100).toFixed(1)}%` : "N/D";

  return {
    face_shape: resolvedShape,
    style_summary: `Se genero el resultado usando solo el modelo local del proyecto para ${resolvedShape}.`,
    recommendations: [
      `Prueba accesorios pensados para rostro ${resolvedShape}.`,
      "Usa una selfie frontal con buena iluminacion para mejorar la precision.",
      "Si el resultado no te convence, vuelve a intentar con una foto mas clara y centrada.",
    ],
    accessory_focus: ["GAFAS", "ARETES", "COLLARES"],
    prediction_strategy: "local_only_fallback",
    prediction_explanation: `OpenAI no estuvo disponible, asi que se uso solo el clasificador local con confianza ${confidenceLabel}.`,
  };
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function extractTextFromResponsePayload(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const textParts = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") {
        textParts.push(part.text);
      }
    }
  }

  return textParts.join("\n").trim();
}

function normalizeAnalysis(parsed) {
  const fallback = fallbackAnalysis();
  const safe = parsed && typeof parsed === "object" ? parsed : {};

  return {
    face_shape: normalizeFaceShape(safe.face_shape),
    style_summary:
      typeof safe.style_summary === "string" && safe.style_summary.trim()
        ? safe.style_summary.trim()
        : fallback.style_summary,
    recommendations: Array.isArray(safe.recommendations) && safe.recommendations.length
      ? safe.recommendations.map((value) => String(value)).slice(0, 6)
      : fallback.recommendations,
    accessory_focus: Array.isArray(safe.accessory_focus) && safe.accessory_focus.length
      ? safe.accessory_focus.map(normalizeAccessoryType).filter(Boolean).slice(0, 4)
      : fallback.accessory_focus,
  };
}

function inferClosestShape(parsed) {
  const text = [
    String(parsed?.face_shape || ""),
    String(parsed?.style_summary || ""),
    ...(Array.isArray(parsed?.recommendations) ? parsed.recommendations.map((item) => String(item || "")) : []),
  ]
    .join(" ")
    .toLowerCase();

  const contains = (tokens) => tokens.some((token) => text.includes(token));

  if (contains(["cuadrad", "mandibula ancha", "jawline strong", "jawline square"])) return "Cuadrado";
  if (contains(["rectang", "alargad", "rostro largo", "long face"])) return "Rectangular";
  if (contains(["redond", "mejillas llenas", "round face"])) return "Redondo";
  if (contains(["diamant", "rombo", "pomulos marcados", "cheekbones prominent"])) return "Diamante";
  if (contains(["corazon", "corazón", "triangulo invertido", "triángulo invertido", "frente ancha"])) return "Corazon";
  if (contains(["triangular", "triangulo", "triángulo", "pera", "mandibula mas ancha"])) return "Triangular";
  if (contains(["oval", "ovalado", "proporciones equilibradas"])) return "Ovalado";

  return "Ovalado";
}

function combinePredictions(openaiFaceShape, localPrediction) {
  if (!localPrediction?.face_shape) {
    return {
      finalFaceShape: openaiFaceShape,
      strategy: "openai_only",
      confidence: null,
      explanation: "Se uso OpenAI porque no hubo prediccion local disponible.",
    };
  }

  if (localPrediction.face_shape === openaiFaceShape) {
    return {
      finalFaceShape: openaiFaceShape,
      strategy: "consensus",
      confidence: localPrediction.confidence,
      explanation: "OpenAI y el modelo local coincidieron en la misma forma de rostro.",
    };
  }

  if ((localPrediction.confidence || 0) >= 0.12) {
    return {
      finalFaceShape: localPrediction.face_shape,
      strategy: "local_override",
      confidence: localPrediction.confidence,
      explanation: "El modelo local detecto una separacion mas clara entre clases y ajusto la decision final.",
    };
  }

  return {
    finalFaceShape: openaiFaceShape,
    strategy: "openai_priority",
    confidence: localPrediction.confidence,
    explanation: "Las predicciones difirieron y se priorizo OpenAI porque la senal local fue debil.",
  };
}

router.post("/analyze", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "photo is required" });
    }

    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      return res.status(400).json({ error: "Unsupported file type. Use JPG, PNG or WEBP." });
    }

    const localPrediction = await predictLocalFaceShapeFromBuffer(req.file.buffer, req.file.mimetype).catch((error) => {
      console.error("Local model failed:", error);
      return null;
    });
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!openaiKey) {
      if (!localPrediction?.face_shape) {
        return res.status(500).json({ error: "Missing OPENAI_API_KEY in environment and no local prediction available" });
      }

      const localOnly = buildLocalOnlyAnalysis(localPrediction);
      const referenceFace = pickReferenceFace(localOnly.face_shape);
      const accessoryRecommendations = pickAccessoryRecommendations(localOnly.face_shape, localOnly.accessory_focus);

      return res.json({
        analysis: {
          ...localOnly,
          catalog_face_shape: resolveCatalogFaceShape(localOnly.face_shape),
        },
        predictionSignals: {
          openai: {
            face_shape: null,
          },
          local: localPrediction,
          final: {
            face_shape: localOnly.face_shape,
            strategy: localOnly.prediction_strategy,
            confidence: localPrediction.confidence ?? null,
          },
        },
        referenceFace,
        accessoryRecommendations,
        warning: "OpenAI no esta configurado. Se uso solo el modelo local.",
      });
    }

    const imageBase64 = req.file.buffer.toString("base64");
    const mime = req.file.mimetype || "image/jpeg";
    const catalogPromptContext = getCatalogPromptContext();
    const localHint = localPrediction?.face_shape
      ? `Prediccion local del clasificador base: ${localPrediction.face_shape} con confianza relativa ${localPrediction.confidence}. Usala como pista secundaria, no como respuesta ciega.`
      : "No hay prediccion local disponible para esta imagen.";

    const instructions = `
Analiza la forma del rostro de la persona en la imagen para recomendaciones de accesorios.
Reglas obligatorias para "face_shape":
- Solo puedes elegir una categoria de esta lista exacta:
  ["Ovalado","Redondo","Cuadrado","Rectangular","Corazon","Diamante","Triangular"]
- NO uses "Ovalado" por defecto.
- Elige SIEMPRE la categoria mas parecida aunque haya ligera incertidumbre.
- Basa la eleccion en frente, pomulos, menton y mandibula.

Tipos de accesorios permitidos para "accessory_focus":
["ARETES","BUFANDAS","COLLARES","DIADEMAS","GAFAS","SOMBREROS"]

Contexto del catalogo local por forma de rostro:
${catalogPromptContext}

Pista del sistema local:
${localHint}

Devuelve SOLO JSON valido y minificado con este esquema:
{
  "face_shape": "una categoria exacta de la lista",
  "style_summary": "resumen breve en espanol explicando la lectura del rostro",
  "recommendations": [
    "recomendacion concreta en espanol sobre accesorios",
    "recomendacion concreta en espanol sobre accesorios",
    "recomendacion concreta en espanol sobre accesorios"
  ],
  "accessory_focus": ["tipo permitido 1", "tipo permitido 2", "tipo permitido 3"]
}
No markdown, no texto extra.
`;

    const openaiBase = process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1";
    const openaiUrl = openaiBase.replace(/\/+$/, "") + "/responses";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const openaiResponse = await fetch(openaiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: instructions },
                { type: "input_image", image_url: `data:${mime};base64,${imageBase64}` },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "beauty_analysis",
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  face_shape: {
                    type: "string",
                    enum: ["Ovalado", "Redondo", "Cuadrado", "Rectangular", "Corazon", "Diamante", "Triangular"],
                  },
                  style_summary: { type: "string" },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                  },
                  accessory_focus: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["ARETES", "BUFANDAS", "COLLARES", "DIADEMAS", "GAFAS", "SOMBREROS"],
                    },
                  },
                },
                required: ["face_shape", "style_summary", "recommendations", "accessory_focus"],
              },
              strict: true,
            },
          },
        }),
      }).finally(() => clearTimeout(timer));

      if (!openaiResponse.ok) {
        throw new Error(`OpenAI upstream error: ${await openaiResponse.text()}`);
      }

      const openaiData = await openaiResponse.json();
      const raw = extractTextFromResponsePayload(openaiData);
      const parsed = safeJsonParse(raw) || fallbackAnalysis();
      const normalized = normalizeAnalysis(parsed);
      const openaiFaceShape = inferClosestShape(parsed) || normalized.face_shape;
      const combined = combinePredictions(openaiFaceShape, localPrediction);

      normalized.face_shape = combined.finalFaceShape;

      const catalogFaceShape = resolveCatalogFaceShape(normalized.face_shape);
      const accessoryRecommendations = pickAccessoryRecommendations(normalized.face_shape, normalized.accessory_focus);
      const referenceFace = pickReferenceFace(normalized.face_shape);

      return res.json({
        analysis: {
          ...normalized,
          catalog_face_shape: catalogFaceShape,
          prediction_strategy: combined.strategy,
          prediction_explanation: combined.explanation,
        },
        predictionSignals: {
          openai: {
            face_shape: openaiFaceShape,
          },
          local: localPrediction,
          final: {
            face_shape: combined.finalFaceShape,
            strategy: combined.strategy,
            confidence: combined.confidence,
          },
        },
        referenceFace,
        accessoryRecommendations,
        warning: accessoryRecommendations.length ? null : "No se encontraron accesorios locales para este tipo de rostro.",
      });
    } catch (openaiError) {
      if (!localPrediction?.face_shape) {
        throw openaiError;
      }

      const localOnly = buildLocalOnlyAnalysis(localPrediction);
      const referenceFace = pickReferenceFace(localOnly.face_shape);
      const accessoryRecommendations = pickAccessoryRecommendations(localOnly.face_shape, localOnly.accessory_focus);

      return res.json({
        analysis: {
          ...localOnly,
          catalog_face_shape: resolveCatalogFaceShape(localOnly.face_shape),
        },
        predictionSignals: {
          openai: {
            face_shape: null,
          },
          local: localPrediction,
          final: {
            face_shape: localOnly.face_shape,
            strategy: localOnly.prediction_strategy,
            confidence: localPrediction.confidence ?? null,
          },
        },
        referenceFace,
        accessoryRecommendations,
        warning: "OpenAI no respondio correctamente. Se uso solo el modelo local.",
      });
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      return res.status(504).json({ error: "Timeout while contacting external services" });
    }

    return res.status(500).json({ error: String(error) });
  }
});

export default router;
