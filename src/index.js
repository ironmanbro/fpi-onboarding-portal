// API for the FPI onboarding demo. Applications live in D1, uploaded files in KV.
// Roles (client, ops, ddp) are picked on a demo login screen; there is no real authentication.
const ID = /^[A-Za-z0-9-]{3,40}$/;
const DOC = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_FILE = 10 * 1024 * 1024;
const SAFE_INLINE = ["application/pdf", "image/png", "image/jpeg"];
const EDITABLE = ["In progress", "Returned"];
const CLOSED = ["Completed", "Rejected", "Cancelled"];
// BRS roles: investor (external), rm (Application RM), reviewer (Business Reviewer), maker / checker (DDP Ops), bizchecker (registrations)
const ROLES = ["investor", "rm", "reviewer", "maker", "checker", "bizchecker"];
const REG_TYPES = ["FPI Applicant", "Global Custodian"];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
const fail = (status, message) => json({ error: message }, status);
const now = () => new Date().toISOString();
const clean = (s, n = 2000) => String(s || "").trim().slice(0, n);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      console.error(e);
      return fail(500, "Something went wrong on the server. Try again in a moment.");
    }
  },
};

async function load(env, id) {
  const row = await env.DB.prepare("SELECT data FROM apps WHERE id = ?").bind(id).first();
  if (!row) return null;
  const data = JSON.parse(row.data);
  data._wf = data._wf || { events: [], queries: [], docReview: {} };
  return data;
}
async function store(env, data, progress) {
  await env.DB.prepare(
    `UPDATE apps SET name = ?2, status = ?3, data = ?4, reg_no = ?5, updated_at = datetime('now')
     ${progress == null ? "" : ", progress = ?6"} WHERE id = ?1`
  )
    .bind(data._id, data.invName || null, data._status, JSON.stringify(data), data._wf.regNo || null, ...(progress == null ? [] : [progress | 0]))
    .run();
}

async function route(req, env, url) {
  const m = req.method;
  const parts = url.pathname.slice(5).split("/").filter(Boolean);
  if (parts[0] === "registrations") return registrations(req, env, parts[1], parts[2]);
  if (parts[0] === "reports" && m === "GET") return reports(env, parts[1], url);
  if (parts[0] !== "apps") return fail(404, "Not found");
  const [, id, sub, doc] = parts;

  if (!id) {
    if (m === "GET") {
      const owner = url.searchParams.get("owner");
      const q = owner
        ? env.DB.prepare(`SELECT id, name, owner, status, progress, reg_no, created_at, updated_at,
         json_extract(data, '$.incCountry') AS country, json_extract(data, '$.invType') AS inv_type,
         json_extract(data, '$.product') AS product, json_extract(data, '$.subProd') AS sub_prod,
         json_extract(data, '$._initBy') AS init_by, json_extract(data, '$._created') AS start_date FROM apps WHERE owner = ? ORDER BY updated_at DESC LIMIT 200`).bind(owner)
        : env.DB.prepare(`SELECT id, name, owner, status, progress, reg_no, created_at, updated_at,
         json_extract(data, '$.incCountry') AS country, json_extract(data, '$.invType') AS inv_type,
         json_extract(data, '$.product') AS product, json_extract(data, '$.subProd') AS sub_prod,
         json_extract(data, '$._initBy') AS init_by, json_extract(data, '$._created') AS start_date FROM apps ORDER BY updated_at DESC LIMIT 200`);
      return json({ apps: (await q.all()).results });
    }
    if (m === "POST") {
      const body = await req.json();
      const data = body.data || {};
      const owner = clean(body.owner, 120);
      if (!ID.test(data._id || "")) return fail(400, "Application ID is missing or invalid.");
      if (!owner) return fail(400, "Enter the investor name to create an application.");
      data._owner = owner;
      data._status = "In progress";
      const role = ROLES.includes(body.role) ? body.role : "investor";
      data._initBy = role === "rm" ? "RM" : "Investor";
      data._wf = { events: [{ at: now(), by: clean(body.user, 120) || owner, role, what: role === "rm" ? `Application initiated by RM for ${owner}` : "Application created" }], queries: [], docReview: {}, checks: {} };
      await env.DB.prepare("INSERT INTO apps (id, name, owner, status, progress, data) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(data._id, data.invName || null, owner, data._status, body.progress | 0, JSON.stringify(data))
        .run();
      return json({ id: data._id }, 201);
    }
    return fail(405, "Method not allowed");
  }

  if (!ID.test(id)) return fail(400, "Invalid application ID.");

  if (!sub) {
    if (m === "GET") {
      const data = await load(env, id);
      if (!data) return fail(404, "This application does not exist or was deleted.");
      return json({ data });
    }
    if (m === "PUT") {
      // Client autosave. Workflow fields are owned by the server and never taken from the request.
      const old = await load(env, id);
      if (!old) return fail(404, "This application does not exist or was deleted.");
      if (!EDITABLE.includes(old._status)) return fail(409, `This application is ${old._status.toLowerCase()} and can't be edited now.`);
      const body = await req.json();
      const data = body.data || {};
      Object.assign(data, { _id: id, _owner: old._owner, _status: old._status, _wf: old._wf, _initBy: old._initBy });
      await store(env, data, body.progress);
      return json({ ok: true, saved_at: now() });
    }
    if (m === "DELETE") {
      const { results } = await env.DB.prepare("SELECT doc_id FROM files WHERE app_id = ?").bind(id).all();
      await Promise.all(results.map((r) => env.FILES.delete(`${id}/${r.doc_id}`)));
      await env.DB.batch([
        env.DB.prepare("DELETE FROM files WHERE app_id = ?").bind(id),
        env.DB.prepare("DELETE FROM apps WHERE id = ?").bind(id),
      ]);
      return json({ ok: true });
    }
    return fail(405, "Method not allowed");
  }

  if (sub === "actions" && m === "POST") {
    const data = await load(env, id);
    if (!data) return fail(404, "This application does not exist or was deleted.");
    const body = await req.json();
    const result = act(data, body);
    if (result.error) return fail(409, result.error);
    await store(env, data);
    return json({ data });
  }

  if (sub === "files" && doc && DOC.test(doc)) {
    const key = `${id}/${doc}`;
    if (m === "PUT") {
      const data = await load(env, id);
      if (!data) return fail(404, "Save the application before uploading files.");
      if (!EDITABLE.includes(data._status)) return fail(409, "Documents can't be changed while the application is under review.");
      const buf = await req.arrayBuffer();
      if (!buf.byteLength) return fail(400, "The file is empty.");
      if (buf.byteLength > MAX_FILE) return fail(413, "Files must be 10 MB or smaller.");
      const name = decodeURIComponent(req.headers.get("x-file-name") || "document").slice(0, 200);
      const type = req.headers.get("content-type") || "application/octet-stream";
      await env.FILES.put(key, buf, { metadata: { name, type } });
      await env.DB.prepare(
        `INSERT INTO files (app_id, doc_id, name, type, size) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(app_id, doc_id) DO UPDATE SET name = ?3, type = ?4, size = ?5, uploaded_at = datetime('now')`
      ).bind(id, doc, name, type, buf.byteLength).run();
      // A new file replaces any earlier verification of that document.
      if (data._wf.docReview[doc]) {
        delete data._wf.docReview[doc];
        await store(env, data);
      }
      return json({ name, size: buf.byteLength });
    }
    if (m === "GET") {
      const { value, metadata } = await env.FILES.getWithMetadata(key, { type: "stream" });
      if (!value) return fail(404, "File not found.");
      const name = (metadata && metadata.name) || "document";
      // Only show PDFs and images in the browser; anything else downloads, so an uploaded page can never run on this site.
      const safe = SAFE_INLINE.includes(metadata && metadata.type);
      return new Response(value, {
        headers: {
          "content-type": safe ? metadata.type : "application/octet-stream",
          "content-disposition": `${safe ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
          "content-security-policy": "sandbox",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
  }
  return fail(404, "Not found");
}

// BRS section 3 reports. Roles come from the demo sign-in, so this check only keeps each report with the role it is meant for.
const REPORT_ROLES = { admin: ["reviewer", "bizchecker"], audit: ["rm"], clients: ["maker", "checker"] };
const EVENTS = `SELECT a.id AS app_id, a.name, a.owner, json_extract(e.value, '$.at') AS at, json_extract(e.value, '$.by') AS by_user,
  json_extract(e.value, '$.role') AS role, json_extract(e.value, '$.what') AS what, json_extract(e.value, '$.note') AS note
  FROM apps a, json_each(a.data, '$._wf.events') e`;
const REPORT_SQL = {
  // Activity of internal users: reviews, checks and approvals on applications, plus registration decisions.
  admin: `SELECT * FROM (SELECT at, by_user, role, what, app_id AS ref, note FROM (${EVENTS}) WHERE role IN ('reviewer', 'maker', 'checker')
    UNION ALL SELECT replace(updated_at, ' ', 'T') || 'Z', decided_by, 'bizchecker', 'Registration ' || lower(status), id, reason
    FROM registrations WHERE status IN ('Authorised', 'Rejected'))
    WHERE substr(at, 1, 10) BETWEEN ?1 AND ?2 ORDER BY at DESC LIMIT 2000`,
  audit: `SELECT * FROM (${EVENTS}) WHERE substr(at, 1, 10) BETWEEN ?1 AND ?2 ORDER BY at DESC LIMIT 2000`,
  clients: `SELECT id, name, owner, status, reg_no, json_extract(data, '$._wf.pan') AS pan, json_extract(data, '$.incCountry') AS country,
    json_extract(data, '$.category') AS category, json_extract(data, '$.subcat') AS subcat, json_extract(data, '$.invType') AS inv_type,
    json_extract(data, '$.lei') AS lei, json_extract(data, '$.regEmail') AS email, json_extract(data, '$._wf.nsdlRef') AS nsdl_ref,
    json_extract(data, '$._wf.accounts') AS accounts, updated_at FROM apps
    WHERE status IN ('Registered', 'Accounts opened', 'Completed') AND substr(updated_at, 1, 10) BETWEEN ?1 AND ?2 ORDER BY updated_at DESC LIMIT 2000`,
};
async function reports(env, name, url) {
  if (!REPORT_SQL[name]) return fail(404, "Unknown report.");
  if (!REPORT_ROLES[name].includes(url.searchParams.get("role"))) return fail(403, "This report isn't available for your role.");
  const day = (k, d) => (/^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get(k) || "") ? url.searchParams.get(k) : d);
  const { results } = await env.DB.prepare(REPORT_SQL[name]).bind(day("from", "0000-00-00"), day("to", "9999-99-99")).all();
  return json({ rows: results });
}

// BR-01/02: investor registration, captured as a lead before submission, then authorised or rejected by the Business Checker.
async function registrations(req, env, id, sub) {
  const m = req.method;
  if (!id && m === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM registrations ORDER BY updated_at DESC LIMIT 300").all();
    return json({ registrations: results });
  }
  if (!id && m === "POST") {
    const b = await req.json();
    const rid = ID.test(b.id || "") ? b.id : "REG-" + Date.now().toString(36).toUpperCase();
    const v = {
      user_type: REG_TYPES.includes(b.user_type) ? b.user_type : null,
      name: clean(b.name, 120), country: clean(b.country, 60), phone: clean(b.phone, 30), email: clean(b.email, 120),
    };
    if (b.submit) {
      if (!v.user_type || !v.name || !v.country || !v.phone || !v.email) return fail(400, "Fill in all mandatory fields before submitting.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail(400, "Enter a valid email address.");
    }
    const old = await env.DB.prepare("SELECT status FROM registrations WHERE id = ?").bind(rid).first();
    if (old && old.status !== "Lead") return fail(409, "This registration has already been submitted.");
    await env.DB.prepare(
      `INSERT INTO registrations (id, user_type, name, country, phone, email, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT(id) DO UPDATE SET user_type = ?2, name = ?3, country = ?4, phone = ?5, email = ?6, status = ?7, updated_at = datetime('now')`
    ).bind(rid, v.user_type, v.name, v.country, v.phone, v.email, b.submit ? "Pending" : "Lead").run();
    return json({ id: rid, status: b.submit ? "Pending" : "Lead" });
  }
  if (id && sub === "decision" && m === "POST") {
    const b = await req.json();
    if (!["Authorised", "Rejected"].includes(b.decision)) return fail(400, "Choose Authorise or Reject.");
    if (b.decision === "Rejected" && !clean(b.reason)) return fail(400, "Enter the reason for rejection.");
    const row = await env.DB.prepare("SELECT status FROM registrations WHERE id = ?").bind(id).first();
    if (!row) return fail(404, "Registration not found.");
    if (row.status !== "Pending") return fail(409, "Only pending registrations can be decided.");
    await env.DB.prepare("UPDATE registrations SET status = ?2, reason = ?3, decided_by = ?4, updated_at = datetime('now') WHERE id = ?1")
      .bind(id, b.decision, clean(b.reason) || null, clean(b.user, 120) || null).run();
    return json({ ok: true });
  }
  return fail(404, "Not found");
}

// Simulated integrations (PAN, LEI, AML, Factiva, FAROS/PFT, NSDL). Each returns a fixed, clearly labelled demo response.
const API_CHECKS = {
  pan: "NSDL PAN validation: Valid PAN (simulated)",
  lei: "GLEIF LEI lookup: Valid LEI, legal name match (simulated)",
  aml: "AML screening: Pass, no matches (simulated)",
  factiva: "Factiva adverse media: no relevant hits (simulated)",
  faros: "FAROS / PFT screening: Pass (simulated)",
};
const CHECKS = ["factiva", "faros", "google", "fatf", "iosco", "registry", "regulatory", "sebi", "aml", "lei", "pan"];
const OPTIONAL_CHECKS = ["lei"];
const ACCOUNTS = (d) => ["DP account", "Bank account", "Custody account", ...((d.subProd || []).includes("PCM") ? ["I-PCM account"] : []), ...((d.subProd || []).includes("CSGL") ? ["I-CSGL account"] : [])];
const rand = (n) => String(Math.floor(10 ** (n - 1) + Math.random() * 9 * 10 ** (n - 1)));

// Workflow (BRS 4.5–4.8):
// In progress → Business review → Maker review → Checker review → Fee pending → Ready for NSDL → NSDL submitted
//   → Registered → Accounts opened → Completed. Any reviewer can return to Returned; the checker can reject; investor/RM can cancel.
function act(data, body) {
  const role = body.role, by = clean(body.user, 120) || role, type = body.type, text = clean(body.text);
  if (!ROLES.includes(role)) return { error: "Unknown role." };
  const wf = data._wf;
  wf.checks = wf.checks || {};
  const st = data._status;
  const log = (what, note) => wf.events.push({ at: now(), by, role, what, note: note || undefined });
  const move = (to, what, note) => { data._status = to; log(what, note); };
  const closeAnswered = () => wf.queries.forEach((q) => { if (q.status === "answered") Object.assign(q, { status: "resolved", resolvedBy: by, resolvedAt: now() }); });
  const openQ = () => wf.queries.filter((q) => q.status === "open");
  const owner = role === "investor" || role === "rm";
  const STAGE = { reviewer: ["Business review"], maker: ["Maker review"], checker: ["Checker review"] };
  const atStage = (STAGE[role] || []).includes(st);

  if (type === "cancel") {
    if (!owner) return { error: "Only the investor or RM can cancel an application." };
    if (CLOSED.includes(st) || ["NSDL submitted", "Registered", "Accounts opened"].includes(st)) return { error: "This application can no longer be cancelled." };
    if (!text) return { error: "Please enter the reason for cancellation." };
    move("Cancelled", "Application cancelled", text);
    return {};
  }
  if (owner && type === "submit") {
    if (!EDITABLE.includes(st)) return { error: "This application has already been submitted." };
    if (openQ().length) return { error: `Respond to ${openQ().length} open remark${openQ().length > 1 ? "s" : ""} before resubmitting.` };
    move("Business review", st === "Returned" ? "Resubmitted after rectification" : "Application submitted for review");
    return {};
  }
  if (owner && type === "reply") {
    const q = wf.queries.find((x) => x.id === body.qid);
    if (!q || q.status !== "open") return { error: "This remark is already answered or closed." };
    if (!text) return { error: "Write a reply first." };
    Object.assign(q, { status: "answered", reply: text, repliedBy: by, repliedAt: now() });
    log("Responded to a remark", text);
    return {};
  }
  if (["reviewer", "maker", "checker"].includes(role)) {
    if (type === "return") {
      if (!atStage) return { error: "You can only return applications in your queue." };
      if (!text) return { error: "Add remarks so the investor knows what to correct." };
      wf.queries.push({ id: "q" + Date.now().toString(36), from: role, by, text, section: clean(body.section, 120) || null, at: now(), status: "open" });
      move("Returned", "Returned for rectification", text);
      return {};
    }
    if (type === "resolve") {
      const q = wf.queries.find((x) => x.id === body.qid);
      if (!q || q.status === "resolved") return { error: "This remark is already closed." };
      Object.assign(q, { status: "resolved", resolvedBy: by, resolvedAt: now() });
      log("Closed a remark", q.text);
      return {};
    }
    if (type === "doc") {
      if (!atStage) return { error: "Documents can be reviewed only while the application is in your queue." };
      if (!DOC.test(body.docId || "") || !["verified", "rejected"].includes(body.s)) return { error: "Unknown document decision." };
      if (body.s === "rejected" && !text) return { error: "Add a reason for rejecting the document." };
      wf.docReview[body.docId] = { s: body.s, note: text || undefined, by, at: now() };
      log(body.s === "verified" ? "Verified a document" : "Rejected a document", `${clean(body.docName, 200)}${text ? ": " + text : ""}`);
      return {};
    }
  }
  if (role === "reviewer" && type === "approve") {
    if (st !== "Business review") return { error: "This application is not in the Business Reviewer queue." };
    closeAnswered();
    move("Maker review", "Approved by Business Reviewer and sent to Ops Maker", text);
    return {};
  }
  if ((role === "maker" && st === "Maker review") || (role === "checker" && st === "Checker review")) {
    if (type === "check" || type === "runcheck") {
      if (!CHECKS.includes(body.key)) return { error: "Unknown check." };
      if (type === "runcheck") {
        if (!API_CHECKS[body.key]) return { error: "This check is recorded manually." };
        wf.checks[body.key] = { s: "Pass", note: API_CHECKS[body.key], by, at: now(), api: true };
      } else {
        if (!["Pass", "Fail", "NA"].includes(body.s)) return { error: "Choose Pass, Fail or NA." };
        if (body.s === "Fail" && !text) return { error: "Add a remark explaining the failed check." };
        wf.checks[body.key] = { s: body.s, note: text || undefined, by, at: now() };
      }
      log(`Recorded check: ${body.key.toUpperCase()}`, `${wf.checks[body.key].s}${wf.checks[body.key].note ? " · " + wf.checks[body.key].note : ""}`);
      return {};
    }
  }
  if (role === "maker" && type === "forward") {
    if (st !== "Maker review") return { error: "This application is not in the Ops Maker queue." };
    const missing = CHECKS.filter((k) => !OPTIONAL_CHECKS.includes(k) && !wf.checks[k]);
    if (missing.length) return { error: `Complete all checks before forwarding (${missing.length} left).` };
    if (CHECKS.some((k) => wf.checks[k] && wf.checks[k].s === "Fail")) return { error: "A check has failed. Return the application for rectification instead." };
    closeAnswered();
    move("Checker review", "Maker checks completed; forwarded to Ops Checker", text);
    return {};
  }
  if (role === "checker") {
    if (type === "approve") {
      if (st !== "Checker review") return { error: "This application is not in the Ops Checker queue." };
      if (CHECKS.some((k) => wf.checks[k] && wf.checks[k].s === "Fail")) return { error: "A check has failed. Return or reject the application." };
      closeAnswered();
      move("Fee pending", "Approved by Ops Checker", `SEBI registration fee email sent to ${data.regEmail || "the investor"} (simulated)`);
      return {};
    }
    if (type === "reject") {
      if (st !== "Checker review") return { error: "This application is not in the Ops Checker queue." };
      if (!text) return { error: "Enter the reason for rejection." };
      move("Rejected", "Rejected by Ops Checker", text);
      return {};
    }
    if (type === "fee") {
      if (st !== "Fee pending") return { error: "No fee is pending for this application." };
      move("Ready for NSDL", "SEBI registration fee sighted", text);
      return {};
    }
    if (type === "nsdl") {
      if (st !== "Ready for NSDL") return { error: "This application is not ready for NSDL submission." };
      wf.nsdlRef = "NSDL-FPI-" + rand(8);
      move("NSDL submitted", "CAF auto-populated and submitted on NSDL", `Reference ${wf.nsdlRef} (simulated)`);
      return {};
    }
    if (type === "fetchreg") {
      if (st !== "NSDL submitted") return { error: "Submit the application on NSDL first." };
      const cc = clean(data.incCountry, 40).replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "XX";
      wf.regNo = `IN${cc}FP${rand(6)}`;
      wf.pan = data.panHas === "Yes" && data.panNo ? data.panNo : "AAF" + "CFPT".charAt(Math.floor(Math.random() * 4)) + String.fromCharCode(65 + Math.floor(Math.random() * 26)) + rand(4) + "Z";
      move("Registered", "Registration certificate and PAN retrieved", `Registration ${wf.regNo} · PAN ${wf.pan} (simulated)`);
      return {};
    }
    if (type === "accounts") {
      if (st !== "Registered") return { error: "Accounts can be opened only after registration." };
      wf.accounts = ACCOUNTS(data).map((name) => ({ name, ref: name.split(" ")[0].replace(/[^A-Z]/gi, "").toUpperCase() + "-" + rand(8), at: now() }));
      move("Accounts opened", "Downstream accounts opened", wf.accounts.map((a) => `${a.name} ${a.ref}`).join(" · ") + " (simulated)");
      return {};
    }
  }
  if (role === "rm" && type === "welcome") {
    if (st !== "Accounts opened") return { error: "The welcome letter is available once all accounts are open." };
    move("Completed", "Welcome letter generated; onboarding completed");
    return {};
  }
  return { error: "This action isn't available for your role at this stage." };
}
