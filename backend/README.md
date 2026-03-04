# Backend

API Express del proyecto.

## Responsabilidades

- Exponer `POST /api/analyze`.
- Cargar el dataset local de `backend/Extra/`.
- Servir las imagenes del catalogo en `/catalog-assets`.
- Consultar OpenAI para clasificar la forma del rostro y orientar recomendaciones.

## Estructura

- `index.js`
- `.env`
- `.env.example`
- `routes/analysis.js`
- `services/accessoryCatalog.js`

