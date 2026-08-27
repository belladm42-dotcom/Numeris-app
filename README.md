# Numeris — Educación y simulación financiera

Proyecto académico · Matemáticas Financieras · Primer Corte 2026-2

## Publicar en 5 minutos (gratis, sin backend)

1. Sube esta carpeta a un repositorio de GitHub (nuevo repo, público o privado).
2. Entra a https://vercel.com → "Add New Project" → conecta tu cuenta de GitHub → selecciona el repo.
3. Vercel detecta Vite automáticamente. Deja los valores por defecto y presiona "Deploy".
4. En 1-2 minutos tendrás una URL pública tipo `https://numeris-tuusuario.vercel.app`, sin login para quien la visite.

Alternativa igual de rápida: Netlify (netlify.com → "Add new site" → "Import from Git").

## Desarrollo local (opcional)

```
npm install
npm run dev
```

## Estructura

- `src/App.jsx` — aplicación completa (motor financiero + interfaz).
- `engine-y-tests/financialEngine.mjs` — motor financiero puro, documentado y probado por separado.
- `engine-y-tests/test.mjs` — batería de 25 pruebas automáticas (ejecutar con `node engine-y-tests/test.mjs`).
