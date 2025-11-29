export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Falta URL' });

  try {
    const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResearchScraper/1.0)' }
    });
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("image")) {
        const buffer = await response.arrayBuffer();
        res.setHeader("Content-Type", contentType);
        res.send(Buffer.from(buffer));
    } else {
        const text = await response.text();
        res.setHeader("Content-Type", "text/html");
        res.status(200).send(text);
    }
  } catch (error) {
    res.status(500).json({ error: 'Error fetching', details: error.message });
  }
}
