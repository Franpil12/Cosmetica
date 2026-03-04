# Curacion del dataset

Esta fase sirve para ampliar el dataset de forma de rostro sin contaminarlo.

## Estructura de ingreso

Material nuevo sin procesar:

- `backend/ml/import-source/Ovalado`
- `backend/ml/import-source/Redondo`
- `backend/ml/import-source/Cuadrado`
- `backend/ml/import-source/Rectangular`
- `backend/ml/import-source/Corazon`
- `backend/ml/import-source/Diamante`
- `backend/ml/import-source/Triangular`

Material listo para promover:

- `backend/ml/inbox/Ovalado`
- `backend/ml/inbox/Redondo`
- `backend/ml/inbox/Cuadrado`
- `backend/ml/inbox/Rectangular`
- `backend/ml/inbox/Corazon`
- `backend/ml/inbox/Diamante`
- `backend/ml/inbox/Triangular`

Pon las fotos nuevas primero en `backend/ml/import-source/`.

## Reglas minimas de calidad

- Una sola persona por imagen.
- Rostro frontal o casi frontal.
- Sin filtros, texto o stickers.
- Buena luz y rostro completo.
- No repetir muchas fotos de la misma persona con la misma pose.

## Scripts

- `npm run dataset:build`
- `npm run dataset:plan`
- `npm run dataset:validate-inbox`
- `npm run dataset:import-extra`
- `npm run dataset:promote-inbox`

## Flujo recomendado

1. Agrega nuevas fotos a `backend/ml/import-source/`.
2. Ejecuta `npm run dataset:import-extra` para copiar al `inbox` segun nombre de carpeta o archivo.
3. Ejecuta `npm run dataset:validate-inbox`.
4. Revisa `backend/ml/face-shape-import-report.json` y `backend/ml/face-shape-inbox-report.json`.
5. Cuando las etiquetas sean confiables, ejecuta `npm run dataset:promote-inbox` para moverlas al dataset principal.
6. Ejecuta otra vez `npm run dataset:build`.
7. Ejecuta `npm run dataset:plan` para medir cuanto falta por clase.

## Meta inicial

Apunta a un minimo de 60 rostros por clase antes de entrenar un primer clasificador serio.
