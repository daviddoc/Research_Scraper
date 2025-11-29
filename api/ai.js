export default async function handler(req, res) {
  // 1. Configurar CORS (Para permitir que tu web llame a este servidor)
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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 2. Obtener la clave segura desde Vercel
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: API Key missing' });
  }

  // 3. Obtener el texto que envía el frontend
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'No text provided' });
  }

  try {
    // 4. Construir el Prompt para Gemini
    const prompt = `
      Actúa como un asistente de investigación académica experto. 
      Analiza el siguiente texto y genera una respuesta ESTRUCTURADA en formato JSON puro (sin bloques de código \`\`\`json).
      
      El JSON debe tener exactamente estas 3 claves:
      1. "summary": Un resumen ejecutivo claro y denso de 2-3 párrafos.
      2. "keyPoints": Una lista markdown de los 5-7 puntos clave o hallazgos más importantes.
      3. "suggestedTags": Una lista de cadenas de texto (strings) con 3 a 5 etiquetas relevantes.

      TEXTO A ANALIZAR:
      ${text.substring(0, 45000)}
    `;

    // 5. Llamar a Google Gemini
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || 'Error upstream from Gemini');
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // Devolvemos el JSON parseado al frontend
    return res.status(200).json(JSON.parse(rawText));

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error processing AI request', details: error.message });
  }
}
