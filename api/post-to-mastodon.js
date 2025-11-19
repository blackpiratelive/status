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
        SITE_URL,
    } = process.env;

    const db = createClient({
        url: TURSO_DATABASE_URL,
        authToken: TURSO_AUTH_TOKEN,
    });

    await db.execute(`
        CREATE TABLE IF NOT EXISTS posted_guids (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guid TEXT NOT NULL UNIQUE,
            posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    try {
        // Fetch RSS
        const rssUrl = `${SITE_URL}/index.xml`;
        const rssResponse = await fetch(rssUrl);
        const xmlText = await rssResponse.text();

        // FIXED REGEX
        const firstItemMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/);
        if (!firstItemMatch) {
            return response.status(200).json({ message: 'No items found in RSS feed.' });
        }
        const latestItemXML = firstItemMatch[1];

        // FIXED REGEXES
        const guidMatch = latestItemXML.match(/<guid>([\s\S]*?)<\/guid>/);
        const linkMatch = latestItemXML.match(/<link>([\s\S]*?)<\/link>/);
        const descriptionMatch = latestItemXML.match(/<description>([\s\S]*?)<\/description>/);

        const latestGuid = guidMatch?.[1];
        const postLink = linkMatch?.[1];
        let descriptionContent = descriptionMatch?.[1];

        // Remove CDATA
        if (descriptionContent?.startsWith('<![CDATA[') && descriptionContent.endsWith(']]>')) {
            descriptionContent = descriptionContent.slice(9, -3);
        }

        // Decode HTML
        descriptionContent = decodeHtmlEntities(descriptionContent);

        // Check DB
        const checkResult = await db.execute({
            sql: 'SELECT guid FROM posted_guids WHERE guid = ?',
            args: [latestGuid],
        });

        // --- Format content with Cheerio ---
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
            links.forEach((link, index) => {
                finalText += `[${index + 1}] ${link}\n`;
            });
        }

        if (checkResult.rows.length > 0) {
            return response.status(200).json({
                alreadyPosted: true,
                guid: latestGuid,
                wouldHavePosted: finalText.trim(),
            });
        }

        // Post to Mastodon
        const mastodonResponse = await fetch(MASTODON_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MASTODON_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ status: finalText.trim() }),
        });

        if (!mastodonResponse.ok) {
            const errorBody = await mastodonResponse.text();
            throw new Error(`Mastodon API error: ${mastodonResponse.status} ${errorBody}`);
        }

        const mastodonData = await mastodonResponse.json();

        const mastodonHost = new URL(MASTODON_API_URL).hostname;

        // FIXED BROKEN REGEX FOR TRIMMING SLASHES
        let postPath = '';
        if (postLink) {
            const urlPath = new URL(postLink).pathname.replace(/^\/|\/$/g, '');
            postPath = `content/${urlPath}.md`;
        }

        // Store in DB
        await db.execute({
            sql: 'INSERT INTO posted_guids (guid) VALUES (?)',
            args: [latestGuid],
        });

        return response.status(200).json({
            success: true,
            guid: latestGuid,
            postedContent: finalText.trim(),
            id: mastodonData.id,
            url: mastodonData.url,
            post_path: postPath,
            mastodon_host: mastodonHost,
            mastodon_username: mastodonData.account?.username || '',
            created_at: mastodonData.created_at,
        });
    } catch (error) {
        return response.status(500).json({ error: error.message });
    }
}
