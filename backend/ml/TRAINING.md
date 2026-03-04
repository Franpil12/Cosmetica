# Entrenamiento

Esta carpeta prepara el dataset para entrenar un clasificador de forma de rostro que complemente a OpenAI.

## Estado actual del dataset

- Solo se usan imagenes de `backend/Extra/APP ROSTROS/APP ROSTROS/*/ROSTROS`.
- Usa `backend/ml/inbox/` para recibir nuevas muestras antes de promoverlas al dataset principal.
- La clase `Triangular` ya puede mantenerse dentro del dataset principal cuando exista material suficiente.

Con este volumen no conviene entrenar todavia un modelo final sin revisar calidad y balance. Lo correcto es:

1. Preparar y versionar el dataset.
2. Evaluar con validacion cruzada.
3. Aumentar y balancear el numero de rostros por clase.
4. Entrenar un modelo pequeno de clasificacion y usar OpenAI para explicacion y recomendaciones.

## Scripts

- `node backend/ml/build-face-shape-dataset.mjs`
- `node backend/ml/plan-face-shape-expansion.mjs`
- `node backend/ml/validate-face-shape-inbox.mjs`
- `node backend/ml/import-extra-to-inbox.mjs`
- `node backend/ml/extract-face-shape-features.mjs`
- `node backend/ml/train-face-shape-baseline.mjs`

Genera:

- `backend/ml/face-shape-dataset.json`
- `backend/ml/face-shape-summary.json`
- `backend/ml/face-shape-expansion-plan.json`
- `backend/ml/face-shape-inbox-report.json`
- `backend/ml/face-shape-import-report.json`
- `backend/ml/face-shape-features.json`
- `backend/ml/face-shape-baseline-metrics.json`
- `backend/ml/face-shape-baseline-model.json`

## Baseline

Ya existe un primer pipeline local sin dependencias externas:

1. `npm run dataset:build`
2. `npm run ml:extract-features`
3. `npm run ml:train-baseline`

El baseline usa imagenes redimensionadas a `32x32` en escala de grises y un clasificador por centroides con validacion cruzada segun los folds del dataset.

## Nota de compatibilidad

El extractor actual de features usa `sharp` en Node para que el entrenamiento y la inferencia local compartan el mismo pipeline tanto en Windows como en Railway/Linux.

## Curacion

La estructura `backend/ml/inbox/` queda lista para ingresar nuevas imagenes por clase antes de moverlas al dataset principal.
