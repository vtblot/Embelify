# Embelify

App web **100 % navigateur** : upscale, fond transparent, conversion SVG.

- Aucun stockage d’assets utilisateurs
- Livraison = **téléchargement** du résultat
- Fermer l’onglet / couper la session → **mémoire vidée**

## Pipeline (ordre fixe)

1. **Upscale** ×2 / ×4 — UpscalerJS (ESRGAN slim, tenseurs + patchSize), fallback canvas  
2. **Fond transparent** — **Auto** : fond uni (flood-fill) pour logos/aplats, IA photo sinon  
   (`Fond uni` forcé pour noir/aplats ; `IA photo` pour sujets photo)  
3. **SVG** — ImageTracer dans un **Web Worker**

Optimisations : préchargement idle des modèles, réutilisation des sessions IA, plafonds de résolution, export WebP quand pas d’alpha, purge canvas / ObjectURL.

## Lancer

```bash
npm install
npm run dev
```

→ http://127.0.0.1:5173

## Build

```bash
npm run build
npm run preview
```
