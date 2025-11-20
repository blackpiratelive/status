import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  try {
    // Path to your Hugo-generated JSON
    const jsonPath = path.join(process.cwd(), 'public', 'index.json');
    
    // Read and parse the JSON file
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    
    // Return only first 5 posts
    const firstFive = data.slice(0, 5);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*'); // allow cross-origin requests
    res.status(200).json(firstFive);

  } catch (err) {
    res.status(500).json({ error: 'Failed to read JSON' });
  }
}
