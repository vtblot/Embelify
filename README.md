# Embelify

App web **100 % navigateur** : upscale, fond transparent, conversion SVG.

Aucune image n’est envoyée ni stockée sur un serveur. Le traitement est éphémère (mémoire de l’onglet).

## Pipeline

Étapes indépendantes, toujours dans cet ordre :

1. **Upscale** ×2 / ×4 — UpscalerJS (ESRGAN slim), fallback canvas  
2. **Fond transparent** — `@imgly/background-removal` (ONNX local)  
3. **SVG** — ImageTracer.js  

## Lancer en local

```bash
npm install
npm run dev
```

Ouvrez l’URL affichée (http://127.0.0.1:5173).

> Au premier traitement, les modèles IA sont téléchargés une fois puis mis en cache par le navigateur.

## Build

```bash
npm run build
npm run preview
```
