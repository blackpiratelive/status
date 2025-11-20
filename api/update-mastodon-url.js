import { createClient } from "@libsql/client";

export default async function handler(req, res) {
  try {
    const db = createClient({ 
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });

    // ---- FIX: Parse JSON body safely ----
    let body;

    // If running in Vercel/CF Workers (fetch-style request)
    if (typeof req.json === "function") {
      body = await req.json();
    } 
    // If running in Node (AWS Lambda / Netlify functions / raw API Gateway)
    else {
      const raw = await new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => (data += chunk));
        req.on("end", () => resolve(data));
        req.on("error", reject);
      });
      body = raw ? JSON.parse(raw) : {};
    }

    const { slug, mastodonUrl } = body;

    if (!slug || !mastodonUrl) {
      return res.status(400).json({ error: "Missing slug or mastodonUrl" });
    }

    // ---- Update row ----
    await db.execute({
      sql: `
          UPDATE posted_guids
          SET mastodon_url = ?
          WHERE guid = ?
      `,
      args: [mastodonUrl, slug]
    });

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Update Mastodon URL error:", error);

    // Handle Vercel-style & Node-style responses
    if (res?.status) {
      return res.status(500).json({ error: error.message });
    }

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500
    });
  }
}
