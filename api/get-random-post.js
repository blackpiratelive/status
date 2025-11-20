import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    // Path to your Hugo-generated JSON
    const jsonPath = path.join(process.cwd(), 'public', 'index.json');
    
    // Read and parse JSON
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    if (!data.length) {
      res.status(404).json({ error: 'No posts found' });
      return;
    }

    // Pick one random post
    const randomIndex = Math.floor(Math.random() * data.length);
    const post = data[randomIndex];

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); // allow external access
    res.status(200).json(post);

  } catch (err) {
    res.status(500).json({ error: 'Failed to read JSON' });
    console.error(err);
  }
}
