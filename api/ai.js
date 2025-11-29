export default async function handler(req, res) {
  // Configuración de seguridad (CORS)
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. VERIFICACIÓN DE CLAVE (DIAGNÓSTICO)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ERROR CRÍTICO: La variable GEMINI_API_KEY no existe en Vercel. Añádela en Settings y vuelve a editar este archivo para redesplegar.' });
  }

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No se recibió texto para analizar.' });

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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        })
    });

    // 2. REPORTE DE ERROR DE GOOGLE
    if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `GOOGLE RECHAZÓ LA PETICIÓN: ${errorText}` });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!rawText) throw new Error("Google respondió pero no envió texto.");

    return res.status(200).json(JSON.parse(rawText));

  } catch (error) {
    return res.status(500).json({ error: `ERROR INTERNO: ${error.message}` });
  }
}
