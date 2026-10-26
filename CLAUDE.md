# FPI Onboarding Portal

Demo FPI onboarding app on Cloudflare Workers. Pushing to `main` deploys automatically. Follow the `token-efficient-web-dev` skill.

## Files
- `public/index.html`: the entire front end (CSS + JS in one file, ~1,200 lines). **Never read it whole.** Grep for a section marker, then read only that range.
- `src/index.js`: Worker API and workflow rules (`act()` holds the role/status transitions).
- `wrangler.jsonc`: bindings (D1 `DB`, KV `FILES`, assets `./public`).
- `migrations/*.sql`: schema history. Schema changes are applied to the live D1 database by hand (Cloudflare connector), then saved here as the next numbered file.

## Section markers in public/index.html
CSS: `/* Header */`, `/* Shell */`, `/* Main */`, `/* Tables */`, `/* Buttons */`, `/* Docs */`, `/* Review */`, `/* Applications home */`, `/* Roles, login and workflow */`. Colour tokens are in the `:root` block at the top.
JS (`/* ---------- Name ---------- */`): Reference data, Schema (form fields; `STEPS` and `DOCS`), State (`sample()`, `blank()`), Demo sign-in, Status language, Cloud storage, Home, Workflow panel, Helpers, Render: header & rail, Render: fields, Render: main, Documents, Review, Navigation, Events.

## Rules
- Keep the site unbranded: no bank, vendor or depository names in text.
- Roles: client, ops, ddp. Workflow fields (`_status`, `_wf`, `_owner`) are server-owned; never let the client PUT change them.
- No build step and no npm dependencies in the repo. Use wrangler from a scratch folder for local testing.
