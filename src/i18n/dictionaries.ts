export type Locale = "en" | "fr";

export type Dict = {
  "meta.title": string;
  "header.tagline": string;
  "hero.lede": string;
  "dropzone.title": string;
  "dropzone.hint": string;
  "options.legend": string;
  "options.order": string;
  "step1.label": string;
  "step1.optional": string;
  "step1.off": string;
  "step1.desc": string;
  "step2.label": string;
  "step2.desc": string;
  "step2.how": string;
  "step2.chroma": string;
  "step2.auto": string;
  "step2.ai": string;
  "step2.hint.chroma": string;
  "step2.hint.auto": string;
  "step2.hint.ai": string;
  "step2.edges": string;
  "step2.edges.normal": string;
  "step2.edges.tight": string;
  "step2.scope": string;
  "step2.scope.exterior": string;
  "step2.scope.interior": string;
  "step3.label": string;
  "step3.optional": string;
  "step3.desc": string;
  "actions.recompute": string;
  "actions.recompute.hint": string;
  "status.drop": string;
  "status.choose": string;
  "status.needOption": string;
  "status.updating": string;
  "status.processing": string;
  "status.ready": string;
  "status.downloaded": string;
  "status.cleared": string;
  "status.noResult": string;
  "status.optionChanged": string;
  "status.aborted": string;
  "status.fail": string;
  "preview.alt": string;
  "preview.default": string;
  "preview.processing": string;
  "preview.synced": string;
  "preview.svgReady": string;
  "preview.pngReady": string;
  "preview.resultReady": string;
  "preview.waiting": string;
  "preview.download": string;
  "preview.clear": string;
  "preview.ephemeral": string;
  "badge.prep": string;
  "badge.changed": string;
  "badge.error": string;
  "badge.source.loading": string;
  "badge.upscale.loading": string;
  "badge.background.loading": string;
  "badge.svg.loading": string;
  "badge.done.loading": string;
  "badge.source.ready": string;
  "badge.upscale.ready": string;
  "badge.background.ready": string;
  "badge.svg.ready": string;
  "badge.done.ready": string;
  "footer.privacy": string;
  "footer.terms": string;
  "footer.sister": string;
  "footer.lang": string;
  "sister.blurb": string;
  "terms.title": string;
  "terms.back": string;
  "terms.h1": string;
  "terms.updated": string;
  "terms.s1.h": string;
  "terms.s1.p": string;
  "terms.s2.h": string;
  "terms.s2.p": string;
  "terms.s3.h": string;
  "terms.s3.p": string;
  "terms.s4.h": string;
  "terms.s4.p": string;
  "terms.s5.h": string;
  "terms.s5.p": string;
  "terms.s6.h": string;
  "terms.s6.p": string;
  "terms.s7.h": string;
  "terms.s7.p": string;
  "workspace.aria": string;
};

export const en: Dict = {
  "meta.title": "Embelify — Upscale · Cutout · SVG",
  "header.tagline": "Local · live preview · download",
  "hero.lede":
    "Tweak the options: the preview updates at every step. Download the result — nothing is stored.",
  "dropzone.title": "Drop an image",
  "dropzone.hint": "PNG, JPEG, WebP — never uploaded or saved",
  "options.legend": "Options",
  "options.order": "Each change refreshes the preview · order: background → upscale → SVG",
  "step1.label": "Upscale",
  "step1.optional": "(optional)",
  "step1.off": "Off",
  "step1.desc": "Enlarge and clean a small or blurry image. Leave Off if it is already sharp.",
  "step2.label": "Transparent background",
  "step2.desc": "Make the background invisible (e.g. black around a logo).",
  "step2.how": "How?",
  "step2.chroma": "Solid color — logos, black backgrounds, grids…",
  "step2.auto": "Auto — detect logo or photo",
  "step2.ai": "Photo — cut out a person / object",
  "step2.hint.chroma": "Best for logos / flat graphics: removes a single background color (often black).",
  "step2.hint.auto": "Picks for you: solid color for a logo, subject cutout for a photo.",
  "step2.hint.ai": "For photos: isolates a person or object. Not suited to flat logos. Exterior only restores eyes from the original.",
  "step2.edges": "Edges",
  "step2.edges.normal": "Normal",
  "step2.edges.tight": "Tighter — crop ~5px fringe / arcs",
  "step2.scope": "Contours",
  "step2.scope.exterior": "Exterior only — keep eyes / holes",
  "step2.scope.interior": "Exterior + interior — also clear holes",
  "step3.label": "Convert to SVG",
  "step3.optional": "(optional)",
  "step3.desc": "Vectorizes logos / simple shapes. Not suited to photos.",
  "actions.recompute": "Recompute",
  "actions.recompute.hint":
    "Forces a new run with the current options. Changing a setting already refreshes the preview automatically.",
  "status.drop": "Drop an image to see a live preview.",
  "status.choose": "Choose an image.",
  "status.needOption": "Enable at least one option to see a result.",
  "status.updating": "Updating preview (please wait while models load)…",
  "status.processing": "Processing…",
  "status.ready": "Preview up to date — download to keep the file.",
  "status.downloaded": "Result downloaded. Closing the tab clears everything.",
  "status.cleared": "Session cleared.",
  "status.noResult": "Nothing to download yet.",
  "status.optionChanged": "Option changed — recomputing shortly…",
  "status.aborted": "New update in progress…",
  "status.fail": "Processing failed.",
  "preview.alt": "Result",
  "preview.default": "Preview",
  "preview.processing": "Processing…",
  "preview.synced": "Preview in sync",
  "preview.svgReady": "SVG ready — download it",
  "preview.pngReady": "Transparent PNG — ready to download",
  "preview.resultReady": "Result — ready to download",
  "preview.waiting": "Waiting…",
  "preview.download": "Download",
  "preview.clear": "Clear session",
  "preview.ephemeral": "Delivery = download only. Close the tab → assets are wiped.",
  "badge.prep": "Preparing…",
  "badge.changed": "Change detected…",
  "badge.error": "Error",
  "badge.source.loading": "Reading image…",
  "badge.upscale.loading": "Upscaling…",
  "badge.background.loading": "Removing background…",
  "badge.svg.loading": "Converting to SVG…",
  "badge.done.loading": "Finalizing…",
  "badge.source.ready": "Source shown",
  "badge.upscale.ready": "Upscale done",
  "badge.background.ready": "Background removed",
  "badge.svg.ready": "SVG done",
  "badge.done.ready": "Ready to download",
  "footer.privacy": "No user storage · processing 100% in your browser",
  "footer.terms": "Terms of use",
  "footer.sister": "Also from us",
  "footer.lang": "Language",
  "sister.blurb": "Another tool from the same company — separate product & domain.",
  "terms.title": "Embelify — Terms of use",
  "terms.back": "← Back to Embelify",
  "terms.h1": "Terms of use",
  "terms.updated": "Last updated: July 17, 2026",
  "terms.s1.h": "1. Service",
  "terms.s1.p":
    "Embelify is a browser-based image tool (upscale, background removal, SVG). Processing runs locally on your device. Embelify is operated by the same company as Spektrografy; each product has its own domain and purpose.",
  "terms.s2.h": "2. No upload / no storage",
  "terms.s2.p":
    "Images are not uploaded to our servers for processing. Results are delivered by download. Closing the tab clears in-session assets. Browser caches for AI models may remain on your device.",
  "terms.s3.h": "3. Acceptable use",
  "terms.s3.p":
    "You must only process content you have the rights to use. You must not use Embelify for unlawful, harmful, or infringing purposes.",
  "terms.s4.h": "4. Results & liability",
  "terms.s4.p":
    "Output quality depends on your input and device. The service is provided “as is”, without warranty of fitness for a particular purpose. We are not liable for loss of data resulting from closing the session without downloading.",
  "terms.s5.h": "5. Future accounts & credits",
  "terms.s5.p":
    "Paid plans, accounts, or credits may be introduced later. Separate commercial terms will apply and will be shown before purchase.",
  "terms.s6.h": "6. Sister products",
  "terms.s6.p":
    "Links to Spektrografy or other sister tools are provided for convenience. Each product has its own terms and privacy policy.",
  "terms.s7.h": "7. Contact",
  "terms.s7.p":
    "For questions about these terms, contact the operator via the Spektrografy / Embelify company channels published on the product sites.",
  "workspace.aria": "Workspace",
};

export const fr: Dict = {
  "meta.title": "Embelify — Upscale · Détourage · SVG",
  "header.tagline": "Local · aperçu live · téléchargement",
  "hero.lede":
    "Ajustez les options : l’aperçu se met à jour à chaque étape. Téléchargez le résultat — rien n’est stocké.",
  "dropzone.title": "Déposez une image",
  "dropzone.hint": "PNG, JPEG, WebP — jamais envoyé ni sauvegardé",
  "options.legend": "Options",
  "options.order": "Chaque changement recalcule l’aperçu · ordre : fond → upscale → SVG",
  "step1.label": "Upscale",
  "step1.optional": "(optionnel)",
  "step1.off": "Non",
  "step1.desc":
    "Agrandit et nettoie une image floue ou petite. Laissez « Non » si elle est déjà nette.",
  "step2.label": "Fond transparent",
  "step2.desc": "Rend le fond invisible (ex. noir autour d’un logo).",
  "step2.how": "Comment ?",
  "step2.chroma": "Couleur unie — logos, fond noir, grilles…",
  "step2.auto": "Auto — détecte logo ou photo",
  "step2.ai": "Photo — découpe une personne / un objet",
  "step2.hint.chroma":
    "Idéal pour logos / aplats : enlève une couleur de fond (souvent le noir).",
  "step2.hint.auto":
    "Choisit tout seul : fond uni pour un logo, découpe sujet pour une photo.",
  "step2.hint.ai":
    "Pour les photos : isole une personne ou un objet. Pas adapté aux logos plats. « Extérieur seul » restaure les yeux depuis l’original.",
  "step2.edges": "Bords",
  "step2.edges.normal": "Normal",
  "step2.edges.tight": "Serré — coupe ~5px de halo / arcs",
  "step2.scope": "Contours",
  "step2.scope.exterior": "Extérieur seul — garde yeux / trous",
  "step2.scope.interior": "Extérieur + intérieur — vide aussi les trous",
  "step3.label": "Convertir en SVG",
  "step3.optional": "(optionnel)",
  "step3.desc": "Vectorise logos / formes simples. Pas adapté aux photos.",
  "actions.recompute": "Recalculer",
  "actions.recompute.hint":
    "Relance le traitement avec les options actuelles. Changer une option rafraîchit déjà l’aperçu automatiquement.",
  "status.drop": "Déposez une image pour voir l’aperçu en direct.",
  "status.choose": "Choisissez une image.",
  "status.needOption": "Activez au moins une option pour voir un résultat.",
  "status.updating": "Mise à jour de l’aperçu (patientez pendant le chargement)…",
  "status.processing": "Traitement en cours…",
  "status.ready": "Aperçu à jour — téléchargez pour garder le fichier.",
  "status.downloaded": "Résultat téléchargé. Fermer l’onglet efface tout.",
  "status.cleared": "Session vidée.",
  "status.noResult": "Aucun résultat à télécharger.",
  "status.optionChanged": "Option modifiée — recalcul dans un instant…",
  "status.aborted": "Nouvelle mise à jour en cours…",
  "status.fail": "Échec du traitement.",
  "preview.alt": "Résultat",
  "preview.default": "Aperçu",
  "preview.processing": "Traitement…",
  "preview.synced": "Aperçu synchronisé",
  "preview.svgReady": "SVG prêt — téléchargez",
  "preview.pngReady": "PNG transparent — prêt à télécharger",
  "preview.resultReady": "Résultat — prêt à télécharger",
  "preview.waiting": "En attente…",
  "preview.download": "Télécharger",
  "preview.clear": "Vider la session",
  "preview.ephemeral":
    "Livraison = téléchargement. Onglet fermé → tout est effacé.",
  "badge.prep": "Préparation…",
  "badge.changed": "Changement détecté…",
  "badge.error": "Erreur",
  "badge.source.loading": "Lecture de l’image…",
  "badge.upscale.loading": "Upscale en cours…",
  "badge.background.loading": "Fond transparent en cours…",
  "badge.svg.loading": "Conversion SVG en cours…",
  "badge.done.loading": "Finalisation…",
  "badge.source.ready": "Source affichée",
  "badge.upscale.ready": "Upscale OK",
  "badge.background.ready": "Fond transparent OK",
  "badge.svg.ready": "SVG OK",
  "badge.done.ready": "Prêt à télécharger",
  "footer.privacy": "Aucun stockage utilisateur · traitement 100 % dans votre navigateur",
  "footer.terms": "CGU",
  "footer.sister": "Aussi de notre part",
  "footer.lang": "Langue",
  "sister.blurb":
    "Un autre outil de la même entreprise — produit et domaine distincts.",
  "terms.title": "Embelify — Conditions générales d’utilisation",
  "terms.back": "← Retour à Embelify",
  "terms.h1": "Conditions générales d’utilisation",
  "terms.updated": "Dernière mise à jour : 17 juillet 2026",
  "terms.s1.h": "1. Service",
  "terms.s1.p":
    "Embelify est un outil d’image dans le navigateur (upscale, fond transparent, SVG). Le traitement s’exécute localement sur votre appareil. Embelify est opéré par la même entreprise que Spektrografy ; chaque produit a son propre domaine et sa propre finalité.",
  "terms.s2.h": "2. Pas d’envoi / pas de stockage",
  "terms.s2.p":
    "Les images ne sont pas envoyées sur nos serveurs pour traitement. Les résultats sont livrés par téléchargement. Fermer l’onglet efface les assets de session. Le cache navigateur des modèles IA peut rester sur votre appareil.",
  "terms.s3.h": "3. Usage acceptable",
  "terms.s3.p":
    "Vous ne devez traiter que des contenus pour lesquels vous disposez des droits. Tout usage illégal, nuisible ou contrefaisant est interdit.",
  "terms.s4.h": "4. Résultats et responsabilité",
  "terms.s4.p":
    "La qualité dépend de l’image source et de votre appareil. Le service est fourni « en l’état », sans garantie d’adéquation à un usage particulier. Nous ne sommes pas responsables de la perte de données si vous fermez la session sans télécharger.",
  "terms.s5.h": "5. Comptes et crédits futurs",
  "terms.s5.p":
    "Des offres payantes, comptes ou crédits pourront être ajoutés plus tard. Des conditions commerciales distinctes s’appliqueront et seront présentées avant tout achat.",
  "terms.s6.h": "6. Produits sœurs",
  "terms.s6.p":
    "Les liens vers Spektrografy ou d’autres outils sœurs sont fournis pour information. Chaque produit a ses propres CGU et politique de confidentialité.",
  "terms.s7.h": "7. Contact",
  "terms.s7.p":
    "Pour toute question relative aux présentes CGU, contactez l’opérateur via les canaux Spektrografy / Embelify indiqués sur les sites produits.",
  "workspace.aria": "Zone de travail",
};
