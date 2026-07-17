# Embelify

App web **100 % navigateur** : upscale, fond transparent, conversion SVG.

- Aucun stockage d’assets utilisateurs
- Livraison = **téléchargement** du résultat
- Fermer l’onglet / couper la session → **mémoire vidée**

## Pipeline (ordre fixe)

1. **Upscale** ×2 / ×4 — UpscalerJS (ESRGAN slim, tenseurs + patchSize), fallback canvas  
2. **Fond transparent** (optionnel)  
   - **Couleur unie** : logos / fond noir (flood-fill + nettoyage des franges)  
   - **Photo** : découpe sujet (modèle local)  
   - **Auto** : choisit entre les deux  
3. **SVG** (optionnel) — ImageTracer dans un **Web Worker**

L’**upscale est optionnel** (désactivé par défaut). L’aperçu se met à jour **en live** à chaque modification.

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
