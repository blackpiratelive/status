// /api/post-to-mastodon.js

import { createClient } from '@libsql/client';

// Main handler for the Vercel serverless function
export default async function handler(request, response) {
    // --- 1. Configuration & Environment Variables ---
    const {
        TURSO_DATABASE_URL,
        TURSO_AUTH_TOKEN,
        MASTODON_ACCESS_TOKEN,
        MASTODON_API_URL,
        SITE_URL, // e.g., https://status.blackpiratex.com
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
        // Updated table to store permalinks instead of filenames
        await db.execute(`
            CREATE TABLE IF NOT EXISTS posted_permalinks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                permalink TEXT NOT NULL UNIQUE,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (error) {
        console.error('Database setup failed:', error);
        return response.status(500).json({ error: 'Failed to initialize database.' });
    }

    try {
        // --- 3. Fetch and Parse the Posts JSON file ---
        const jsonUrl = `${SITE_URL}/index.json`;
        console.log(`Fetching posts index from: ${jsonUrl}`);

        const postsResponse = await fetch(jsonUrl);
        if (!postsResponse.ok) {
            throw new Error(`Failed to fetch index.json: ${postsResponse.statusText}`);
        }
        const posts = await postsResponse.json();

        if (!posts || posts.length === 0) {
            return response.status(200).json({ message: 'No posts found in the JSON file.' });
        }

        // --- 4. Find the Latest Post ---
        // Helper function to parse the custom date string
        const parseDate = (dateString) => {
            // Converts "23 Aug 2025, 19:34 IST" to a valid Date object
            return new Date(dateString.replace(' IST', ''));
        };

        posts.sort((a, b) => parseDate(b.date) - parseDate(a.date));
        const latestPost = posts[0];

        if (!latestPost || !latestPost.permalink) {
             throw new Error('Could not determine the latest post from the JSON data.');
        }

        // --- 5. Check if the Post Has Already Been Shared ---
        const checkResult = await db.execute({
            sql: 'SELECT permalink FROM posted_permalinks WHERE permalink = ?',
            args: [latestPost.permalink],
        });

        if (checkResult.rows.length > 0) {
            const message = `Latest post "${latestPost.permalink}" has already been posted.`;
            console.log(message);
            return response.status(200).json({ message });
        }

        // --- 6. Prepare and Post to Mastodon ---
        console.log(`New post found: "${latestPost.permalink}". Preparing to post.`);

        // Use plainContent for the post body, as requested
        const status = `${latestPost.plainContent}`;

        const mastodonResponse = await fetch(MASTODON_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${MASTODON_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ status }),
        });

        if (!mastodonResponse.ok) {
            const errorBody = await mastodonResponse.text();
            throw new Error(`Mastodon API error: ${mastodonResponse.status} ${errorBody}`);
        }

        // --- 7. Record the Post in the Database ---
        await db.execute({
            sql: 'INSERT INTO posted_permalinks (permalink) VALUES (?)',
            args: [latestPost.permalink],
        });

        console.log(`Successfully posted and recorded "${latestPost.permalink}".`);
        return response.status(200).json({ success: true, message: `Posted: ${latestPost.permalink}` });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return response.status(500).json({ error: error.message });
    }
}
