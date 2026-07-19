# Embelify

Threat model: [THREAT_MODEL.md](./THREAT_MODEL.md)

Browser-only image tool: upscale, transparent background, SVG.

- No user asset storage — delivery = **download**
- Closing the tab clears the session
- **English by default**, French optional
- Sister product: [Spektrografy](https://spektrografy.com) (same company, separate domain)

## Run

```bash
npm install
npm run dev
```

Optional env:

```bash
# .env
VITE_SPEKTROGRAFY_URL=https://your-spektrografy-domain.com
```

## Legal

Terms of use: `/terms.html` (linked in the footer as CGU / Terms).

## Notes for Spektrografy / infra

Embelify is client-side today. When you add auth + credits, prefer **one Supabase org** (shared Auth / users if you want SSO later) rather than putting identity only on Railway. Keep Spektrografy’s Railway Hobby for that product’s app hosting/compute; Embelify can stay static (or Railway static) and talk to Supabase when monetization lands.
