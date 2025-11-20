import { createClient } from '@libsql/client';

export default async function handler(req, res) {
    if (req.method !== 'POST')
        return res.status(405).json({ error: 'POST only' });

    const { guid, mastodon_url } = await req.json();

    if (!guid || !mastodon_url)
        return res.status(400).json({ error: 'Missing guid or mastodon_url' });

    const db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });

    // Add column if needed
    await db.execute(`
        ALTER TABLE posted_guids 
        ADD COLUMN mastodon_url TEXT;
    `).catch(() => {});

    await db.execute({
        sql: 'UPDATE posted_guids SET mastodon_url = ? WHERE guid = ?',
        args: [mastodon_url, guid],
    });

    return res.json({ success: true });
}
