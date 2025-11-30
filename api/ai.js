export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta la API Key en Vercel.' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No hay texto.' });

  // LISTA DE MODELOS A PROBAR (EN ORDEN DE PREFERENCIA)
  // 1. Flash (Rápido y moderno)
  // 2. Pro (El clásico, muy compatible)
  // 3. Pro Vision (Por si acaso)
  const modelsToTry = ['gemini-1.5-flash', 'gemini-1.5-flash-001', 'gemini-pro'];
  
  let lastError = null;

  // BUCLE DE INTENTOS
  for (const model of modelsToTry) {
    try {
      console.log(`Intentando con modelo: ${model}...`);
      
      const prompt = `
        Actúa como un asistente de investigación. Analiza el texto y responde SOLO con este JSON:
        {
          "summary": "Resumen de 2 párrafos",
          "keyPoints": "Lista markdown de 5 puntos clave",
          "suggestedTags": ["tag1", "tag2", "tag3"]
        }
        TEXTO: ${text.substring(0, 30000)}
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: "application/json" }
          })
      });

      if (!response.ok) {
          const errText = await response.text();
          // Si falla, guardamos el error y continuamos al siguiente modelo del bucle
          throw new Error(`Modelo ${model} falló: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error("Google respondió vacío");

      // ¡ÉXITO! Devolvemos la respuesta y terminamos
      return res.status(200).json(JSON.parse(rawText));

    } catch (error) {
      console.error(error.message);
      lastError = error.message;
      // Continuamos al siguiente modelo...
    }
  }

  // SI LLEGAMOS AQUÍ, TODOS FALLARON
  return res.status(500).json({ 
    error: `Todos los modelos fallaron. Último error: ${lastError}`,
    suggestion: "Verifica que tu API Key sea válida en Google AI Studio."
  });
}
