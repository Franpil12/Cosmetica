# Cosmetica

## Estructura para nube

- `backend/`: API Express, catalogo local, clasificador y variables de entorno privadas.
- `frontend/`: sitio estatico con HTML, CSS y JS. Puede desplegarse separado del backend.
- `netlify.toml`: configuracion para desplegar `frontend/` en Netlify.
- `backend/railway.toml`: configuracion para desplegar `backend/` en Railway.

## Despliegue recomendado

- Backend:
  instala desde `backend/`, usa `npm install` y publica con `npm start`.
- Frontend:
  publica la carpeta `frontend/` como sitio estatico.
- Si frontend y backend quedan en dominios distintos:
  configura `backend/.env` con `FRONTEND_ORIGIN=https://tu-frontend`.
- En Netlify:
  configura `PUBLIC_API_BASE_URL=https://tu-backend.up.railway.app`.
- El build de Netlify genera `frontend/assets/js/runtime-config.js` automaticamente.

## Desarrollo local

- `npm run dev` desde la raiz sigue levantando el backend y sirviendo el frontend local si `SERVE_FRONTEND=true`.
- `frontend/assets/js/config.js` sigue sirviendo como fallback local si no hay runtime config generado.

## Railway + Netlify

- Railway:
  usa `backend/` como `Root Directory`.
- Railway:
  el arranque y healthcheck ya estan definidos en `backend/railway.toml`.
- Railway:
  configura `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_API_BASE_URL`, `FRONTEND_ORIGIN` y `SERVE_FRONTEND=false`.
- Netlify:
  `netlify.toml` ya define `base=frontend`, `publish=.` y el comando para generar la URL del backend.
- Netlify:
  configura `PUBLIC_API_BASE_URL` con la URL publica de Railway.
