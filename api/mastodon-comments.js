import { createClient } from "@libsql/client";

export default async function handler(req, res) {
  const { TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, MASTODON_ACCESS_TOKEN } = process.env;

  const db = createClient({
    url: TURSO_DATABASE_URL,
    authToken: TURSO_AUTH_TOKEN
  });

  try {
    const { url } = await req.json();

    if (!url) return res.status(400).json({ error: "Missing URL" });

    // Find Mastodon post URL from DB
    const queryResult = await db.execute({
      sql: "SELECT mastodon_url FROM posted_guids WHERE guid = ?",
      args: [url]
    });

    if (queryResult.rows.length === 0) {
      return res.status(404).json({ error: "No Mastodon post found for this page." });
    }

    const mastodonUrl = queryResult.rows[0].mastodon_url;
    if (!mastodonUrl) {
      return res.status(404).json({ error: "Mastodon URL is empty." });
    }

    // Extract domain and ID from URL
    const match = mastodonUrl.match(/^https?:\/\/([^/]+)\/@[^/]+\/(\d+)/);
    if (!match) return res.status(400).json({ error: "Invalid Mastodon URL." });

    const [_, instance, postId] = match;

    // Fetch post info from Mastodon API
    const apiUrl = `https://${instance}/api/v1/statuses/${postId}`;
    const mastodonResp = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${MASTODON_ACCESS_TOKEN}` }
    });

    if (!mastodonResp.ok) {
      const body = await mastodonResp.text();
      return res.status(500).json({ error: "Mastodon API error", body });
    }

    const toot = await mastodonResp.json();

    // Return relevant info
    const response = {
      boosts: toot.reblogs_count,
      quotes: toot.reblogged_by_count || 0, // Mastodon API may vary by instance
      favourites: toot.favourites_count,
      replies: toot.replies?.map(r => ({ account: r.account.acct, content: r.content })) || []
    };

    return res.status(200).json(response);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
