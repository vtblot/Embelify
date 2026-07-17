# Embelify

App web **locale** pour embellir une image : upscale, fond transparent, conversion SVG.

## Pipeline

Les étapes sont **indépendantes** (toggles), mais toujours exécutées dans cet ordre pour la meilleure qualité :

1. **Upscale** (×2 / ×4) — FSRCNN, fallback LANCZOS  
2. **Fond transparent** — rembg (u2net)  
3. **SVG** — vtracer (logos / formes simples)

## Lancer en local

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Ouvrez [http://127.0.0.1:8000](http://127.0.0.1:8000).

> Au premier traitement, rembg et le modèle FSRCNN sont téléchargés automatiquement (connexion internet requise une fois).

## API

`POST /api/process`

| Champ        | Type    | Description                          |
|--------------|---------|--------------------------------------|
| `file`       | file    | Image source                         |
| `upscale`    | `1\|2\|4` | Facteur (1 = désactivé)            |
| `remove_bg`  | bool    | Détourage                            |
| `to_svg`     | bool    | Sortie SVG au lieu de PNG            |

Réponse : `image/png` ou `image/svg+xml`.
