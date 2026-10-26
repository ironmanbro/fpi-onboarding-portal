# FPI Onboarding Portal

A guided onboarding portal for Foreign Portfolio Investors. It is a static front-end demo: a single `index.html` with no build step and no backend.

## Flow
1. Investor details: setup, profile, PAN, KYC, income
2. Related parties: parties, authorised signatories, UBO/SMO, UBO FATCA
3. FPI registration: investment management, regulator, custodian, clubbing, prior association
4. Annexure to CAF: Part A, Part B, BO declaration
5. Additional information: AML, additional details, FATCA, CRS self-certification
6. Documents: generate, upload, notes
7. Review & submit

## Data handling
Answers are stored only in the viewer's browser (`localStorage`). Nothing is sent to a server. Use sample data only; do not enter real client or KYC information.

## Deploy on Cloudflare Pages
1. Cloudflare dashboard → Workers & Pages → Create → Pages → **Connect to Git**.
2. Select this repository.
3. Build settings: Framework preset **None**, build command **empty**, build output directory **/**.
4. Save and Deploy. Every push to `main` redeploys automatically.

`_headers` sets security headers and `robots.txt` keeps the demo out of search engines.

## Run locally
Open `index.html` in a browser, or run `python3 -m http.server` in this folder.

## Current deployment
Deployed as a Cloudflare Worker with static assets (`wrangler.jsonc`), connected to this repo. Every push to `main` runs `npx wrangler deploy`. `.assetsignore` keeps the README and config files from being served.
