# FPI Onboarding Portal

Demo FPI onboarding app on Cloudflare Workers. Pushing to `main` deploys automatically. Follow the `token-efficient-web-dev` skill.

## Files
- `public/index.html`: the entire front end (CSS + JS in one file, ~1,200 lines). **Never read it whole.** Grep for a section marker, then read only that range.
- `src/index.js`: Worker API and workflow rules (`act()` holds the role/status transitions).
- `wrangler.jsonc`: bindings (D1 `DB`, KV `FILES`, assets `./public`).
- `migrations/*.sql`: schema history. Schema changes are applied to the live D1 database by hand (Cloudflare connector), then saved here as the next numbered file.

## Section markers in public/index.html
CSS: `/* Header */`, `/* Shell */`, `/* Main */`, `/* Tables */`, `/* Buttons */`, `/* Docs */`, `/* Review */`, `/* Applications home */`, `/* Roles, login and workflow */`. Colour tokens are in the `:root` block at the top.
JS (`/* ---------- Name ---------- */`): Reference data, Schema (form fields; `STEPS` and `DOCS`), State (`sample()`, `blank()`), Demo sign-in (also `/* BR-01` registration, `/* BR-02` Business Checker), Status language, Cloud storage, Home (dashboard), Reports (BRS section 3), `/* ---------- 4.2 Application Basic Information`, Workflow panel (checks, remarks, audit trail), Helpers, Render: header & rail, Render: fields, Render: main, Related party KYC (`kycFields()` is in Schema), Documents (statuses, letterhead, DSC), Review, Navigation, Events.

## Rules
- Keep the site unbranded: no bank, vendor or depository names in text.
- Requirements come from the BRS (not in the repo). Roles: investor, rm (Application RM, "ARM"), reviewer (Business Reviewer: registrations), bizchecker (Business Checker (RM): assigns ARMs, reviews applications), maker, checker. Workflow fields (`_status`, `_wf`, `_owner`, `_initBy`, `_tariff`) are server-owned; never let the client PUT change them. In "Execution pending" a PUT may only change `docs` / `letterhead`.
- External integrations (NSDL, PAN, LEI, AML, Factiva, FAROS) are simulated in `act()` and labelled "(simulated)".
- No build step and no npm dependencies in the repo. Use wrangler from a scratch folder for local testing.
