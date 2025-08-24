// /api/post-to-mastodon.js

import { createClient } from '@libsql/client';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

// Main handler for the Vercel serverless function
export default async function handler(request, response) {
    // --- 1. Configuration & Environment Variables ---
    const {
        TURSO_DATABASE_URL,
        TURSO_AUTH_TOKEN,
        MASTODON_ACCESS_TOKEN,
        MASTODON_API_URL, // e.g., https://mastodon.social/api/v1/statuses
        SITE_URL, // e.g., https://your-hugo-site.com
    } = process.env;

    // Validate that all required environment variables are set
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
        // Ensure the table for tracking posted files exists
        await db.execute(`
            CREATE TABLE IF NOT EXISTS posted_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL UNIQUE,
                posted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (error) {
        console.error('Database setup failed:', error);
        return response.status(500).json({ error: 'Failed to initialize database.' });
    }

    try {
        // --- 3. Find the Latest Hugo Post ---
        // Vercel builds the project, so we look for the content directory relative to the function's location.
        const contentDir = path.join(process.cwd(), 'content', 'posts');
        const files = await fs.readdir(contentDir);

        // Filter for markdown files and sort them to find the most recent one.
        // This assumes a naming convention like YYYY-MM-DD-slug.md
        const latestPostFile = files
            .filter(file => file.endsWith('.md') || file.endsWith('.markdown'))
            .sort()
            .pop(); // The last file in a sorted list is the most recent

        if (!latestPostFile) {
            console.log('No posts found in content/posts.');
            return response.status(200).json({ message: 'No posts found to process.' });
        }

        // --- 4. Check if the Post Has Already Been Shared ---
        const checkResult = await db.execute({
            sql: 'SELECT filename FROM posted_files WHERE filename = ?',
            args: [latestPostFile],
        });

        if (checkResult.rows.length > 0) {
            const message = `Latest post "${latestPostFile}" has already been posted to Mastodon.`;
            console.log(message);
            return response.status(200).json({ message });
        }

        // --- 5. Prepare and Post to Mastodon ---
        console.log(`New post found: "${latestPostFile}". Preparing to post to Mastodon.`);

        // Read the post file and parse its front matter
        const filePath = path.join(contentDir, latestPostFile);
        const fileContent = await fs.readFile(filePath, 'utf8');
        const { data: frontMatter } = matter(fileContent);

        const postTitle = frontMatter.title;
        if (!postTitle) {
            throw new Error(`Post "${latestPostFile}" is missing a 'title' in its front matter.`);
        }

        // Construct the post URL from the filename
        const slug = latestPostFile.replace(/\.md$/, '');
        const postUrl = `${SITE_URL}/posts/${slug}/`;

        // Create the status message for Mastodon
        const status = `New post: ${postTitle}\n\n${postUrl}`;

        console.log('Posting status to Mastodon:', status);

        // Make the API call to Mastodon
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

        console.log('Successfully posted to Mastodon.');

        // --- 6. Record the Post in the Database ---
        await db.execute({
            sql: 'INSERT INTO posted_files (filename) VALUES (?)',
            args: [latestPostFile],
        });

        console.log(`Recorded "${latestPostFile}" in the database.`);

        return response.status(200).json({
            success: true,
            message: `Successfully posted "${postTitle}" to Mastodon.`,
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return response.status(500).json({ error: error.message });
    }
}
