# AI Domain Model Atlas

AI Domain Model Atlas is a small web atlas for browsing AI models by domain, capability, source, and demo link. The current project is intentionally lightweight: the main UI can be published as static files, while `server.js` provides an optional local Node server and API demo endpoint.

## Project Structure

- `index.html` - main page.
- `counting.html` - counting model landing page.
- `segmentation.html` - segmentation model landing page.
- `ocr.html` - OCR and document parsing landing page.
- `styles.css` - page styling.
- `script.js` - client-side filtering, table rendering, and demo interactions.
- `server.js` - optional local Node server and `/api/demo` endpoint.
- `models.json` - model metadata used by the UI.
- `vercel.json` - Vercel static routing and cache headers.
- `robots.txt` - crawler rules.
- `sitemap.xml` - placeholder sitemap using `https://ai-model-atlas.example.com`.

## Local Run

This project does not require a package install for the current local server.

```powershell
cd D:\Code-test\AI_news
node server.js
```

Open:

```text
http://127.0.0.1:5173
```

The server uses `PORT` when it is provided:

```powershell
$env:PORT = "5174"
node server.js
```

## Static Publishing

The UI can be hosted as a static site because the browser loads `index.html`, `styles.css`, `script.js`, and `models.json` directly.

Use this mode for:

- Vercel static deployment.
- GitHub Pages.
- Any CDN or static web host.

Do not expose provider API keys in static hosting. Anything placed in browser JavaScript, HTML, or public JSON can be viewed by visitors.

## Deploy to Vercel

Vercel can serve this repository as a static project.

Recommended settings:

- Framework Preset: `Other`.
- Build Command: leave empty.
- Output Directory: leave empty or use the repository root.
- Install Command: leave empty.

The included `vercel.json` maps all routes back to `index.html`, keeps `robots.txt` and `sitemap.xml` public, and applies long-lived cache headers to CSS, JavaScript, and JSON assets.

After deployment, replace the placeholder domain in `sitemap.xml` and `robots.txt` with the real Vercel production URL or custom domain.

## Publish to GitHub Pages

GitHub Pages can publish the root folder directly.

Steps:

1. Push the repository to GitHub.
2. Open repository Settings.
3. Go to Pages.
4. Set Source to `Deploy from a branch`.
5. Select the branch, then choose `/ (root)` as the folder.
6. Save and wait for the Pages URL to become available.

After the Pages URL is final, update:

- `sitemap.xml`
- the `Sitemap:` line in `robots.txt`
- any public links in project documentation

GitHub Pages only supports static assets. The `/api/demo` endpoint from `server.js` will not run there.

## SEO Notes

The repository includes:

- `robots.txt` allowing crawlers and pointing to the sitemap.
- `sitemap.xml` with the placeholder home page URL.
- Static asset cache headers for Vercel.

Before production launch:

- Replace `https://ai-model-atlas.example.com` with the final canonical domain.
- Add more sitemap entries if the project gains multiple public pages.
- Keep page titles, headings, and model metadata clear and descriptive.
- Verify the deployed page can fetch `models.json` with a `200` response.

## Adding an API Demo Later

The current `server.js` contains an example `/api/demo` endpoint for calling model providers from a server environment. Treat it as a server-side pattern, not as a static-site feature.

Security rules:

- Store API keys only in server environment variables, never in `index.html`, `script.js`, `styles.css`, or `models.json`.
- For Vercel API demos, move provider calls into Vercel serverless functions under an `api/` directory.
- For GitHub Pages, use a separate backend service for API calls because Pages cannot run server code.
- Add request validation, rate limiting, and provider allowlists before exposing any public demo endpoint.
- Do not proxy arbitrary user-selected URLs or arbitrary model providers without server-side checks.
- Log errors without printing secrets, authorization headers, or full provider credentials.

Typical environment variable names used by the optional local server:

```text
OPENAI_API_KEY
ANTHROPIC_API_KEY
GEMINI_API_KEY
XAI_API_KEY
MISTRAL_API_KEY
```

## Monetization Pages

The site includes three SEO landing pages that can become paid-template funnels:

- `counting.html` - counting models and a paid counting-template CTA.
- `segmentation.html` - SAM/GroundingDINO segmentation route and a paid segmentation-template CTA.
- `ocr.html` - OCR/document parsing route and a paid OCR-template CTA.

Before production, replace `hello@example.com` in the CTA links with a real email or payment/checkout URL.

## Deployment Checklist

- Run the project locally and confirm the page loads.
- Confirm `models.json` loads from the deployed domain.
- Update `sitemap.xml` and `robots.txt` to the final canonical domain.
- Replace `hello@example.com` with the production contact or checkout link.
- Keep API keys out of the static files.
- Use a server-side endpoint before enabling any public API demo.
