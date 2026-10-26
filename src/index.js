// API for the FPI onboarding demo. Applications live in D1, uploaded files in KV.
// Roles (client, ops, ddp) are picked on a demo login screen; there is no real authentication.
const ID = /^[A-Za-z0-9-]{3,40}$/;
const DOC = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_FILE = 10 * 1024 * 1024;
const SAFE_INLINE = ["application/pdf", "image/png", "image/jpeg"];
const EDITABLE = ["In progress", "Query raised"];
const ROLES = ["client", "ops", "ddp"];

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
  if (parts[0] !== "apps") return fail(404, "Not found");
  const [, id, sub, doc] = parts;

  if (!id) {
    if (m === "GET") {
      const owner = url.searchParams.get("owner");
      const q = owner
        ? env.DB.prepare("SELECT id, name, owner, status, progress, reg_no, created_at, updated_at FROM apps WHERE owner = ? ORDER BY updated_at DESC LIMIT 200").bind(owner)
        : env.DB.prepare("SELECT id, name, owner, status, progress, reg_no, created_at, updated_at FROM apps ORDER BY updated_at DESC LIMIT 200");
      return json({ apps: (await q.all()).results });
    }
    if (m === "POST") {
      const body = await req.json();
      const data = body.data || {};
      const owner = clean(body.owner, 120);
      if (!ID.test(data._id || "")) return fail(400, "Application ID is missing or invalid.");
      if (!owner) return fail(400, "Sign in as a client to create an application.");
      data._owner = owner;
      data._status = "In progress";
      data._wf = { events: [{ at: now(), by: owner, role: "client", what: "Application created" }], queries: [], docReview: {} };
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
      Object.assign(data, { _id: id, _owner: old._owner, _status: old._status, _wf: old._wf });
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

// Workflow: In progress → Submitted → Under review → (Query raised ↔ Submitted) → Pending DDP approval → Approved / Rejected
function act(data, body) {
  const role = body.role, by = clean(body.user, 120) || role, type = body.type, text = clean(body.text);
  if (!ROLES.includes(role)) return { error: "Unknown role." };
  const wf = data._wf, st = data._status;
  const log = (what, note) => wf.events.push({ at: now(), by, role, what, note: note || undefined });
  const move = (to, what, note) => { data._status = to; log(what, note); };
  const openQ = () => wf.queries.filter((q) => q.status !== "resolved");
  const allowed = (...s) => s.includes(st);
  const needText = () => (text ? null : { error: "Please add a note explaining why." });
  const reviewer = role === "ops" || role === "ddp";

  if (role === "client") {
    if (type === "submit") {
      if (!allowed("In progress", "Query raised")) return { error: "This application has already been submitted." };
      const unanswered = wf.queries.filter((q) => q.status === "open");
      if (unanswered.length) return { error: `Answer ${unanswered.length} open quer${unanswered.length > 1 ? "ies" : "y"} before resubmitting.` };
      move("Submitted", st === "Query raised" ? "Resubmitted after query" : "Application submitted");
      return {};
    }
    if (type === "reply") {
      const q = wf.queries.find((x) => x.id === body.qid);
      if (!q || q.status !== "open") return { error: "This query is already answered or closed." };
      if (!text) return { error: "Write a reply first." };
      Object.assign(q, { status: "answered", reply: text, repliedBy: by, repliedAt: now() });
      log("Replied to a query", text);
      return {};
    }
  }

  if (reviewer && type === "query") {
    const ok = role === "ops" ? allowed("Submitted", "Under review") : allowed("Pending DDP approval");
    if (!ok) return { error: "Queries can only be raised while the application is with you." };
    if (!text) return { error: "Write the query first." };
    wf.queries.push({ id: "q" + Date.now().toString(36), from: role, by, text, section: clean(body.section, 120) || null, at: now(), status: "open" });
    move("Query raised", "Raised a query", text);
    return {};
  }
  if (reviewer && type === "resolve") {
    const q = wf.queries.find((x) => x.id === body.qid);
    if (!q || q.status === "resolved") return { error: "This query is already closed." };
    Object.assign(q, { status: "resolved", resolvedBy: by, resolvedAt: now() });
    log("Closed a query", q.text);
    return {};
  }

  if (role === "ops") {
    if (type === "start") {
      if (!allowed("Submitted")) return { error: "Only submitted applications can be picked up." };
      move("Under review", "Picked up for review");
      return {};
    }
    if (type === "doc") {
      if (!allowed("Submitted", "Under review")) return { error: "Pick up the application for review first." };
      if (!DOC.test(body.docId || "")) return { error: "Unknown document." };
      if (!["verified", "rejected"].includes(body.s)) return { error: "Unknown document decision." };
      if (body.s === "rejected" && !text) return needText();
      wf.docReview[body.docId] = { s: body.s, note: text || undefined, by, at: now() };
      log(body.s === "verified" ? "Verified a document" : "Rejected a document", `${clean(body.docName, 200)}${text ? ": " + text : ""}`);
      return {};
    }
    if (type === "forward") {
      if (!allowed("Under review")) return { error: "Pick up the application for review first." };
      if (openQ().length) return { error: "Close all queries before forwarding to DDP." };
      move("Pending DDP approval", "Verified and forwarded to DDP", text);
      return {};
    }
    if (type === "reject") {
      if (!allowed("Submitted", "Under review")) return { error: "This application is not with ops." };
      if (!text) return needText();
      move("Rejected", "Rejected by ops", text);
      return {};
    }
  }

  if (role === "ddp") {
    if (!allowed("Pending DDP approval")) return { error: "This application is not waiting for DDP approval." };
    if (type === "approve") {
      if (openQ().length) return { error: "Close all queries before approving." };
      const cc = clean(data.incCountry, 40).replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "XX";
      wf.regNo = `IN${cc}FP${String(Math.floor(100000 + Math.random() * 900000))}`;
      move("Approved", "Approved and registration number issued", wf.regNo);
      return {};
    }
    if (type === "return") {
      if (!text) return needText();
      move("Under review", "Returned to ops", text);
      return {};
    }
    if (type === "reject") {
      if (!text) return needText();
      move("Rejected", "Rejected by DDP", text);
      return {};
    }
  }
  return { error: "This action isn't available for your role at this stage." };
}
