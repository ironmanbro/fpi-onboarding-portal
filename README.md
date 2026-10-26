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
| POST | `/api/apps/:id/actions` | Workflow actions (submit, reply, return, check, approve, forward, fee, nsdl, fetchreg, accounts, welcome, cancel…) |
| GET / POST | `/api/registrations` | List registrations; save a lead or submit a registration |
| POST | `/api/registrations/:id/decision` | Authorise or reject a registration |
| PUT / GET / DELETE | `/api/apps/:id/files/:docId` | Upload, view or remove a document |

## Roles (demo sign-in, no password or OTP)
| Role | Portal | Does |
|---|---|---|
| Investor | External | Registers, starts and fills applications, uploads documents, responds to remarks, resubmits, cancels |
| Application RM | Internal | Starts applications on an investor's behalf, edits returned ones, generates the welcome letter |
| Business Reviewer | Internal | Approves to the Ops Maker or returns for rectification |
| DDP Ops Maker | Internal | Records the prescribed checks (Factiva, FAROS/PFT, AML, PAN, LEI via simulated APIs; Google, FATF, IOSCO, registry, regulatory, SEBI manually), forwards or returns |
| DDP Ops Checker | Internal | Approves (SEBI fee email), returns or rejects; marks fee received, submits on NSDL, fetches registration and PAN, opens downstream accounts |
| Business Checker | Internal | Authorises or rejects investor registrations; sees leads |

Workflow: `In progress → Business review → Maker review → Checker review → Fee pending → Ready for NSDL → NSDL submitted → Registered → Accounts opened → Completed`, with `Returned` (rectification), `Rejected` and `Cancelled`.
All workflow rules live in `act()` in `src/index.js`. NSDL, PAN, LEI, AML, Factiva and FAROS responses are simulated.

## Demo environment only
Sign-in has no authentication: anyone with the link can enter under any role. Use made-up data only. Do not enter real client or KYC information.

## Run locally
```
npx wrangler d1 execute fpi-onboarding-db --local --file migrations/0001_init.sql
npx wrangler d1 execute fpi-onboarding-db --local --file migrations/0002_roles.sql
npx wrangler d1 execute fpi-onboarding-db --local --file migrations/0003_brs_workflow.sql
npx wrangler dev
```
