# Ziad's WebZone

A retro 90s-inspired static blog revived with minimal tooling. This repository demonstrates a transparent build pipeline where every file is understandable at a glance.

## Features
- Hand-authored HTML templates
- Markdown posts with front matter
- Node-based generator (`build.js`) using `marked`
- Automatic index & archive injection
- RSS feed (`feed.xml`)
- Sitemap generation
- Retro CRT + scanline + pixel aesthetic
- No heavy frameworks

## Directory Layout
```
content/posts/          # Source markdown posts (you write)
posts/                  # Generated post HTML files (do not edit)
index.template.html     # Homepage template; placeholders get replaced
index.html              # Generated homepage
post-template.html      # HTML shell for individual posts
retro.css               # Global retro styles
site.json               # Site metadata & config
feed.xml                # Generated RSS
sitemap.xml             # Generated sitemap
build.js                # Static build script
.github/workflows/      # GitHub Pages build workflow
```

## Writing a New Post
1. Create a file in `content/posts/` named: `YYYY-MM-DD-your-slug.md`
2. Add front matter:
   ```
   ---
   title: My Cool Post
   date: 2025-10-02
   category: Dev Log
   description: Optional summary sentence.
   ---
   ```
3. Write Markdown content below front matter.
4. Run:
   ```
   npm install   # first time
   npm run build
   ```
5. Commit & push.

## Build Script
- Parses front matter (simple key: value lines)
- Converts Markdown -> HTML with `marked`
- Computes reading time (200 wpm)
- Generates post pages & updates `index.html`
- Produces `feed.xml`
- Produces `sitemap.xml`
- Injects `{{YEAR}}` into post template

## Placeholders in `index.template.html`
- `<!-- LATEST_POSTS -->` newest posts
- `<!-- ARCHIVE_LIST -->` full archive list

## Clean
Remove generated outputs:
```
npm run clean
```

## GitHub Pages
Workflow builds and deploys automatically when you push to `main` (or whichever branch you configure). Ensure Pages settings use "GitHub Actions".

## Source-Only Option
If you prefer not to commit generated output:
```
# .gitignore (optional)
posts/
index.html
feed.xml
sitemap.xml
```
Then rely on the workflow to generate them.

## Accessibility Notes
- High-contrast palette (test with contrast tools)
- Minimal motion
- Semantic headings preserved from Markdown

## License
MIT (see `LICENSE.txt`)

Enjoy the handcrafted web!
