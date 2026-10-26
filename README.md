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

## How it works
- `public/` holds the site (one `index.html`, plus `_headers` and `robots.txt`).
- `src/index.js` is a Cloudflare Worker that serves the site and a small API under `/api/apps`.
- Applications are stored in the D1 database `fpi-onboarding-db` (schema in `migrations/0001_init.sql`).
- Uploaded files (10 MB max each) are stored in the KV namespace `fpi-onboarding-files`.
- Bindings are declared in `wrangler.jsonc`. Every push to `main` deploys through Cloudflare Workers Builds (`npx wrangler deploy`).

## API
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/apps` | List applications |
| POST | `/api/apps` | Create an application |
| GET / PUT / DELETE | `/api/apps/:id` | Read, save or delete one |
| PATCH | `/api/apps/:id` | Change status |
| PUT / GET / DELETE | `/api/apps/:id/files/:docId` | Upload, view or remove a document |

## Demo environment only
There is no login: anyone with the link can view and edit applications. Use made-up data only. Do not enter real client or KYC information.

## Run locally
```
npx wrangler d1 execute fpi-onboarding-db --local --file migrations/0001_init.sql
npx wrangler dev
```
