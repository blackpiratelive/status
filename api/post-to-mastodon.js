// /api/post-to-mastodon.js

import { createClient } from '@libsql/client';
import * as cheerio from 'cheerio';

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

    // --- 1. Database Connection ---
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
        // --- 2. Fetch RSS ---
        const rssUrl = `${SITE_URL}/index.xml`;
        console.log(`Fetching RSS feed from: ${rssUrl}`);

        const rssResponse = await fetch(rssUrl);
        if (!rssResponse.ok) {
            throw new Error(`Failed to fetch index.xml: ${rssResponse.statusText}`);
        }
        const xmlText = await rssResponse.text();

        // --- 3. Find the Latest Item ---
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

        // Remove CDATA wrapper if present
        if (descriptionContent.startsWith('<![CDATA[') && descriptionContent.endsWith(']]>')) {
            descriptionContent = descriptionContent.substring(9, descriptionContent.length - 3);
        }

        // --- 4. Check DB if already posted ---
        const checkResult = await db.execute({
            sql: 'SELECT guid FROM posted_guids WHERE guid = ?',
            args: [latestGuid],
        });

        if (checkResult.rows.length > 0) {
            console.log(`GUID "${latestGuid}" already posted, returning debug content...`);

            // Build "would-have-posted" content
            const $ = cheerio.load(descriptionContent);
            let links = [];
            $('a').each((i, el) => {
                const href = $(el).attr('href');
                if (href) {
                    links.push(href);
                    $(el).replaceWith(`${$(el).text()} [${links.length}]`);
                }
            });

            let plainText = decodeHtmlEntities($.text().trim());

            let debugStatus = plainText;
            if (links.length > 0) {
                debugStatus += '\n\n';
                links.forEach((link, index) => {
                    debugStatus += `[${index + 1}] ${link}\n`;
                });
            }

            return response.status(200).json({
                alreadyPosted: true,
                guid: latestGuid,
                wouldHavePosted: debugStatus.trim(),
            });
        }

        console.log(`New post found: "${latestGuid}". Preparing to post.`);

        // --- 5. Parse with Cheerio ---
        const $ = cheerio.load(descriptionContent);

        let links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                links.push(href);
                $(el).replaceWith(`${$(el).text()} [${links.length}]`);
            }
        });

        let plainText = decodeHtmlEntities($.text().trim());

        // Build final toot
        let status = plainText;
        if (links.length > 0) {
            status += '\n\n';
            links.forEach((link, index) => {
                status += `[${index + 1}] ${link}\n`;
            });
        }

        // --- 6. Post to Mastodon ---
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

        // --- 7. Record Post in DB ---
        await db.execute({
            sql: 'INSERT INTO posted_guids (guid) VALUES (?)',
            args: [latestGuid],
        });

        console.log(`Successfully posted and recorded "${latestGuid}".`);
        return response.status(200).json({
            success: true,
            guid: latestGuid,
            postedContent: status.trim(),
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return response.status(500).json({ error: error.message });
    }
}
