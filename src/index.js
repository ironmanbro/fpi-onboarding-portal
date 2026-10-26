// API for the FPI onboarding demo. Applications live in D1, uploaded files in KV.
const ID = /^[A-Za-z0-9-]{3,40}$/;
const DOC = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_FILE = 10 * 1024 * 1024;
const SAFE_INLINE = ["application/pdf", "image/png", "image/jpeg"];
const STATUSES =["In progress", "Submitted", "Under review", "Query raised", "Approved", "Rejected"];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
const fail = (status, message) => json({ error: message }, status);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url.pathname.slice(5).split("/").filter(Boolean));
    } catch (e) {
      console.error(e);
      return fail(500, "Something went wrong on the server. Try again in a moment.");
    }
  },
};

async function route(req, env, parts) {
  const m = req.method;
  if (parts[0] !== "apps") return fail(404, "Not found");
  const [, id, sub, doc] = parts;

  if (!id) {
    if (m === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, name, status, progress, created_at, updated_at FROM apps ORDER BY updated_at DESC LIMIT 200"
      ).all();
      return json({ apps: results });
    }
    if (m === "POST") {
      const body = await req.json();
      const data = body.data || {};
      if (!ID.test(data._id || "")) return fail(400, "Application ID is missing or invalid.");
      await env.DB.prepare("INSERT INTO apps (id, name, status, progress, data) VALUES (?, ?, ?, ?, ?)")
        .bind(data._id, data.invName || null, data._status || "In progress", body.progress | 0, JSON.stringify(data))
        .run();
      return json({ id: data._id }, 201);
    }
    return fail(405, "Method not allowed");
  }

  if (!ID.test(id)) return fail(400, "Invalid application ID.");

  if (!sub) {
    if (m === "GET") {
      const row = await env.DB.prepare("SELECT data, updated_at FROM apps WHERE id = ?").bind(id).first();
      if (!row) return fail(404, "This application does not exist or was deleted.");
      return json({ data: JSON.parse(row.data), updated_at: row.updated_at });
    }
    if (m === "PUT") {
      const body = await req.json();
      const data = body.data || {};
      data._id = id;
      await env.DB.prepare(
        `INSERT INTO apps (id, name, status, progress, data) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET name = ?2, status = ?3, progress = ?4, data = ?5, updated_at = datetime('now')`
      )
        .bind(id, data.invName || null, data._status || "In progress", body.progress | 0, JSON.stringify(data))
        .run();
      return json({ ok: true, saved_at: new Date().toISOString() });
    }
    if (m === "PATCH") {
      const { status } = await req.json();
      if (!STATUSES.includes(status)) return fail(400, "Unknown status.");
      await env.DB.prepare(
        "UPDATE apps SET status = ?2, data = json_set(data, '$._status', ?2), updated_at = datetime('now') WHERE id = ?1"
      ).bind(id, status).run();
      return json({ ok: true });
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

  if (sub === "files" && doc && DOC.test(doc)) {
    const key = `${id}/${doc}`;
    if (m === "PUT") {
      const exists = await env.DB.prepare("SELECT 1 FROM apps WHERE id = ?").bind(id).first();
      if (!exists) return fail(404, "Save the application before uploading files.");
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
    if (m === "DELETE") {
      await env.FILES.delete(key);
      await env.DB.prepare("DELETE FROM files WHERE app_id = ? AND doc_id = ?").bind(id, doc).run();
      return json({ ok: true });
    }
  }
  return fail(404, "Not found");
}
