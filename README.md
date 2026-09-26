# RVO — Portfolio de Rayane Van Osselt

Portfolio one-page trilingue — **français (langue par défaut)**, anglais, néerlandais — en HTML, CSS et JavaScript natifs.
Aucun framework, aucune dépendance npm : un petit script Python (bibliothèque standard uniquement) génère les trois langues.

## Lancer le site en local

```bash
python3 scripts/build.py   # génère index.html, en/, nl/, 404.html, sitemap.xml…
python3 scripts/serve.py   # http://localhost:4173
```

Le site doit être servi en `http://` : les modules JavaScript et le formulaire ne fonctionnent pas en ouvrant le fichier directement (`file://`).

## Structure

```
index.html · en/index.html · nl/index.html   pages générées — ne pas modifier à la main
404.html · sitemap.xml · robots.txt · site.webmanifest   générés aussi

src/content/site.json        données communes : URL du site, contact, projets (liens, images, couleurs), compétences (niveaux)
src/content/fr.json          tous les textes en français
src/content/en.json          … en anglais
src/content/nl.json          … en néerlandais
src/templates/page.html      gabarit unique de la page
src/templates/404.html       page d'erreur (trilingue)
src/templates/partials/      navigation, sélecteur de langue, icônes

assets/css/main.css          design system (tokens) + styles, mobile-first
assets/js/main.js            point d'entrée
assets/js/modules/           en-tête, menu mobile, langues, animations, compétences, formulaire, constellation
assets/js/data/rvo-points.js points du monogramme RVO, échantillonnés depuis le logo
assets/img/                  images optimisées (AVIF + repli PNG/JPEG), favicons, image Open Graph

scripts/build.py             génération des pages (vérifie aussi que les 3 langues ont exactement les mêmes clés)
scripts/serve.py             serveur de prévisualisation

Logo Portofolio.png, Logos projets/, Logos skills/   fichiers sources d'origine (le site utilise les versions optimisées d'assets/img)
```

## Modifier un texte

1. Modifier la clé voulue dans `src/content/fr.json`, `en.json` **et** `nl.json`.
2. Relancer `python3 scripts/build.py`.

Le build refuse de générer les pages si une clé manque dans une langue : aucun mélange de langues ne peut passer en ligne.
En français, les espaces insécables avant `: ; ! ?` et dans les guillemets sont ajoutées automatiquement.

## Ajouter un projet

1. Exporter le visuel dans `assets/img/projects/` en AVIF (dimensions **paires** — Chrome affiche un aplat de couleur pour certains AVIF aux dimensions impaires) + une version JPEG ou PNG de repli.
2. Ajouter l'entrée dans `projects` de `src/content/site.json` (lien, outil, couleur de plaque, image).
3. Ajouter les textes du projet dans les trois fichiers de langue, sous `projects`.
4. Relancer le build. La mise en page de la mosaïque se règle dans `assets/css/main.css` (section « Work »).

## Formulaire de contact

Le formulaire envoie réellement les messages vers **vanosselt.rayane@gmail.com** via [FormSubmit](https://formsubmit.co) (aucun serveur à gérer, aucun compte à créer).

**Activation obligatoire, une seule fois :**

1. Mettre le site en ligne.
2. Envoyer soi-même un premier message depuis le formulaire en ligne.
3. FormSubmit envoie un e-mail « Activate Form » à vanosselt.rayane@gmail.com : cliquer sur le lien.

Tant que ce n'est pas fait, le visiteur voit un message d'erreur honnête avec un lien direct vers l'adresse e-mail — jamais un faux « message envoyé ».
Après activation, FormSubmit fournit un alias aléatoire qui peut remplacer l'adresse dans `form.endpoint` et `form.fallbackAction` de `site.json` (l'adresse n'apparaît alors plus dans le code source du formulaire).
Protection anti-spam : champ piège `_honey`. Sans JavaScript, le formulaire reste fonctionnel (envoi classique vers FormSubmit, avec captcha).

## Mise en ligne (GitHub Pages)

Dépôt GitHub → **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
Adresse attendue : `https://rayanevanosselt.github.io/My-Portofolio/` (le fichier `.nojekyll` désactive le traitement Jekyll).

Avec un nom de domaine personnalisé, modifier `url` dans `src/content/site.json` puis relancer le build : les balises canonical, hreflang, Open Graph, le sitemap et le robots.txt en dépendent.

## Choix techniques

- **Multilingue** : une page pré-générée par langue (`/`, `/en/`, `/nl/`) avec `lang`, `hreflang`, canonical et métadonnées traduites. Le sélecteur FR · EN · NL est toujours visible (aussi sur mobile). Le choix est mémorisé, et changer de langue ramène au même bloc de la page, sans rejouer les animations.
- **Accessibilité** (visée WCAG 2.2 AA) : HTML sémantique, lien d'évitement, focus visible, menu mobile en `<dialog>` modal natif, onglets ARIA au clavier pour les compétences, erreurs de formulaire annoncées, `prefers-reduced-motion` respecté, contenu lisible sans JavaScript.
- **Performance** : aucune bibliothèque, images AVIF chargées à la demande, versions des modules gérées par une import map (pas de fichiers périmés après une mise en ligne), constellation en Canvas 2D mise en pause hors écran.
- **Polices** : Geist et Geist Mono via Google Fonts. Pour une conformité RGPD maximale (pas d'appel à Google), elles peuvent être hébergées dans `assets/fonts/`.
