export default async function handler(req, res) {
  // Configuración CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ERROR CRÍTICO: Falta la API Key en Vercel.' });
  }

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No hay texto.' });

  try {
    const prompt = `
      Actúa como un asistente de investigación. Analiza el texto y responde SOLO con este JSON:
      {
        "summary": "Resumen de 2 párrafos",
        "keyPoints": "Lista markdown de 5 puntos clave",
        "suggestedTags": ["tag1", "tag2", "tag3"]
      }
      TEXTO: ${text.substring(0, 30000)}
    `;

    // CAMBIO AQUÍ: Usamos la versión específica 'gemini-1.5-flash-001'
    // Si esta falla, probaremos 'gemini-pro' como último recurso.
    const modelVersion = 'gemini-1.5-flash-001'; 
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelVersion}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `GOOGLE ERROR (${modelVersion}): ${errorText}` });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    return res.status(200).json(JSON.parse(rawText));

  } catch (error) {
    return res.status(500).json({ error: `SERVER ERROR: ${error.message}` });
  }
}
