import { createClient } from '@libsql/client';
import * as cheerio from 'cheerio';

// Decode HTML entities properly
function decodeHtmlEntities(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

export default async function handler(request, response) {
    const {
        TURSO_DATABASE_URL,
        TURSO_AUTH_TOKEN,
        MASTODON_ACCESS_TOKEN,
        MASTODON_API_URL,
        SITE_URL
    } = process.env;

    const db = createClient({
        url: TURSO_DATABASE_URL,
        authToken: TURSO_AUTH_TOKEN
    });

    // Ensure DB table exists
    await db.execute(`
        CREATE TABLE IF NOT EXISTS posted_guids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guid TEXT NOT NULL UNIQUE,
            posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            mastodon_url TEXT
        );
    `);
    
   try {
    await db.execute("ALTER TABLE posted_guids ADD COLUMN mastodon_url TEXT;");
} catch (err) {
    // Column already exists → ignore
}

    try {
        // Fetch RSS feed
        const rssUrl = `${SITE_URL}/index.xml`;
        const rssResponse = await fetch(rssUrl);
        const xmlText = await rssResponse.text();

        // Extract the latest <item>
        const firstItemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/);
        if (!firstItemMatch) {
            return response.status(200).json({ message: "No items in RSS feed." });
        }
        const latestItemXML = firstItemMatch[1];

        // Extract GUID
        const guidMatch = latestItemXML.match(/<guid>([\s\S]*?)<\/guid>/);
        const descriptionMatch = latestItemXML.match(/<description>([\s\S]*?)<\/description>/);

        const latestGuid = guidMatch?.[1];
        let descriptionContent = descriptionMatch?.[1];

        // Remove CDATA
        if (descriptionContent?.startsWith('<![CDATA[') && descriptionContent.endsWith(']]>')) {
            descriptionContent = descriptionContent.slice(9, -3);
        }

        // Decode HTML entities
        descriptionContent = decodeHtmlEntities(descriptionContent);

        // Check if this GUID already posted
        const checkResult = await db.execute({
            sql: 'SELECT guid FROM posted_guids WHERE guid = ?',
            args: [latestGuid]
        });

        // Process description with cheerio
        const $ = cheerio.load(descriptionContent);

        let links = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            if (href) {
                links.push(href);
                $(el).replaceWith(`${$(el).text()} [${links.length}]`);
            }
        });

        let plainText = $.text().trim();

        let finalText = plainText;
        if (links.length > 0) {
            finalText += '\n\n';
            links.forEach((link, idx) => {
                finalText += `[${idx + 1}] ${link}\n`;
            });
        }

        // If already posted, skip and return info
        if (checkResult.rows.length > 0) {
            return response.status(200).json({
                alreadyPosted: true,
                guid: latestGuid,
                wouldHavePosted: finalText.trim()
            });
        }

        // ---- POST TO MASTODON ----
        const mastodonResponse = await fetch(MASTODON_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MASTODON_ACCESS_TOKEN}`
            },
            body: JSON.stringify({
                status: finalText.trim()
            })
        });

        const toot = await mastodonResponse.json();

        if (!mastodonResponse.ok) {
            return response.status(500).json({
                error: "Mastodon API error",
                status: mastodonResponse.status,
                body: toot
            });
        }

        // Save guid in DB (mastodon_url will be added later)
        await db.execute({
            sql: "INSERT INTO posted_guids (guid, mastodon_url) VALUES (?, ?)",
            args: [latestGuid, null]
        });

        // SUCCESS — return toot metadata
        return response.status(200).json({
            success: true,
            guid: latestGuid,
            mastodon_id: toot.id,
            mastodon_url: toot.url,
            postedContent: finalText.trim()
        });

    } catch (err) {
        return response.status(500).json({
            error: err.message,
            stack: err.stack
        });
    }
}
