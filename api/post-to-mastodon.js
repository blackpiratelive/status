// /api/post-to-mastodon.js

import { createClient } from '@libsql/client';

// A simple function to decode common HTML entities
function decodeHtmlEntities(text) {
    return text.replace(/&rsquo;/g, "'")
               .replace(/&quot;/g, '"')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>');
}

// Main handler for the Vercel serverless function
export default async function handler(request, response) {
    // --- 1. Configuration & Environment Variables ---
    const {
        TURSO_DATABASE_URL,
        TURSO_AUTH_TOKEN,
        MASTODON_ACCESS_TOKEN,
        MASTODON_API_URL,
        SITE_URL,
    } = process.env;

    if (!TURSO_DATABASE_URL || !TURSO_AUTH_TOKEN || !MASTODON_ACCESS_TOKEN || !MASTODON_API_URL || !SITE_URL) {
        console.error('Missing required environment variables.');
        return response.status(500).json({ error: 'Server configuration error.' });
    }

    // --- 2. Database Connection & Setup ---
    const db = createClient({
        url: TURSO_DATABASE_URL,
        authToken: TURSO_AUTH_TOKEN,
    });

    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS posted_guids (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guid TEXT NOT NULL UNIQUE,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (error) {
        console.error('Database setup failed:', error);
        return response.status(500).json({ error: 'Failed to initialize database.' });
    }

    try {
        // --- 3. Fetch and Parse the RSS Feed ---
        const rssUrl = `${SITE_URL}/index.xml`;
        console.log(`Fetching RSS feed from: ${rssUrl}`);

        const rssResponse = await fetch(rssUrl);
        if (!rssResponse.ok) {
            throw new Error(`Failed to fetch index.xml: ${rssResponse.statusText}`);
        }
        const xmlText = await rssResponse.text();

        // --- 4. Find the Latest Post ---
        const firstItemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/);
        if (!firstItemMatch) {
            return response.status(200).json({ message: 'No items found in the RSS feed.' });
        }
        const latestItemXML = firstItemMatch[1];

        const guidMatch = latestItemXML.match(/<guid>([\s\S]*?)<\/guid>/);
        const descriptionMatch = latestItemXML.match(/<description>([\s\S]*?)<\/description>/);

        if (!guidMatch || !descriptionMatch) {
            throw new Error('Could not parse guid or description from the latest RSS item.');
        }

        const latestGuid = guidMatch[1];
        let descriptionContent = descriptionMatch[1];

        // --- 5. Check if the Post Has Already Been Shared ---
        const checkResult = await db.execute({
            sql: 'SELECT guid FROM posted_guids WHERE guid = ?',
            args: [latestGuid],
        });

        if (checkResult.rows.length > 0) {
            const message = `Latest post with GUID "${latestGuid}" has already been posted.`;
            console.log(message);
            return response.status(200).json({ message });
        }

        // --- 6. Prepare the Mastodon Post ---
        console.log(`New post found: "${latestGuid}". Preparing to post.`);

        // Defensively remove CDATA wrapper if it exists, as Hugo sometimes adds it.
        if (descriptionContent.startsWith('<![CDATA[') && descriptionContent.endsWith(']]>')) {
            descriptionContent = descriptionContent.substring(9, descriptionContent.length - 3);
        }

        // Extract hyperlinks from the description HTML
        const linkRegex = /<a href="([^"]+)">/g;
        const links = [];
        let match;
        while ((match = linkRegex.exec(descriptionContent)) !== null) {
            links.push(match[1]);
        }

        // Get plain text by stripping ALL HTML tags (e.g., <p>, <a>, etc.)
        let plainText = descriptionContent.replace(/<[^>]+>/g, '');
        plainText = decodeHtmlEntities(plainText).trim();

        // Construct the final status
        let status = plainText;
        if (links.length > 0) {
            status += '\n\n'; // Add space before the list of links
            links.forEach((link, index) => {
                status += `${index + 1}. ${link}\n`;
            });
        }

        // --- 7. Post to Mastodon ---
        const mastodonResponse = await fetch(MASTODON_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MASTODON_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ status: status.trim() }),
        });

        if (!mastodonResponse.ok) {
            const errorBody = await mastodonResponse.text();
            throw new Error(`Mastodon API error: ${mastodonResponse.status} ${errorBody}`);
        }

        // --- 8. Record the Post in the Database ---
        await db.execute({
            sql: 'INSERT INTO posted_guids (guid) VALUES (?)',
            args: [latestGuid],
        });

        console.log(`Successfully posted and recorded "${latestGuid}".`);
        return response.status(200).json({ success: true, message: `Posted: ${latestGuid}` });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return response.status(500).json({ error: error.message });
    }
}
