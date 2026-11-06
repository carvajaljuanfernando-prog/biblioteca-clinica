# Biblioteca Clínica (versión para el celular)
Autor: Dr. Juan Fernando Carvajal Estupiñán

## Subir a GitHub (una sola vez)
1. En github.com crea un repositorio nuevo, por ejemplo `biblioteca-clinica`. Público, porque GitHub Pages gratuito lo exige.
2. Entra al repositorio → "Add file" → "Upload files" y arrastra TODOS los archivos de esta carpeta (index.html, standalone.js, sw.js, jspdf.min.js, manifest.webmanifest, icon-192.png, icon-512.png). Confirma con "Commit changes".
3. Settings → Pages → "Deploy from a branch" → rama `main`, carpeta `/ (root)` → Save.
4. En 1-2 minutos aparece la dirección: `https://TU-USUARIO.github.io/biblioteca-clinica/`

## Instalar en el celular
- Android (Chrome): abre la dirección → menú ⋮ → "Instalar aplicación" / "Añadir a pantalla de inicio".
- iPhone (Safari): abre la dirección → botón Compartir → "Añadir a pantalla de inicio".

## Primer uso
1. Buscar → abajo, "Ajustes y copia de seguridad" → pega tu clave de API de Anthropic (console.anthropic.com → API Keys) → Guardar clave.
2. Listo: la búsqueda en PubMed funciona sin clave; los resúmenes, fichas y análisis usan la clave (se cobra por uso).

## Importante
- La clave y la biblioteca se guardan SOLO en ese teléfono/navegador. No la subas al repositorio.
- Haz copias periódicas: Ajustes → "Descargar copia (.json)". Si borras los datos del navegador, se pierde la biblioteca.
- Para pasar la biblioteca de la versión de Claude a esta (o al revés): descargar copia en una e "Importar copia" en la otra.
- Los PDF se descargan o se comparten desde el teléfono; la exportación automática a Google Drive solo existe en la versión dentro de Claude.
- Para actualizar la app: sube los archivos nuevos al repositorio (reemplazan a los anteriores).
