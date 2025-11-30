export default async function handler(req, res) {
  // Configuración de Seguridad (CORS)
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
  if (!text) return res.status(400).json({ error: 'No hay texto para analizar.' });

  // LISTA DE MODELOS A PROBAR (Basado en tus capturas)
  // El script intentará uno tras otro hasta que uno funcione.
  const modelsToTry = [
    'gemini-2.0-flash',                 // OPCIÓN 1: El estándar rápido y moderno
    'gemini-2.0-flash-lite-preview-02-05', // OPCIÓN 2: El ligero (backup)
    'gemini-2.0-pro-exp-02-05',         // OPCIÓN 3: El potente (backup final)
    'gemini-2.0-flash-exp'              // OPCIÓN 4: Experimental
  ];
  
  let lastError = null;

  // BUCLE DE INTENTOS
  for (const model of modelsToTry) {
    try {
      // console.log(`Intentando con modelo: ${model}...`); // (Opcional para logs)
      
      const prompt = `
        Actúa como un asistente de investigación académica experto. 
        Analiza el siguiente texto y genera una respuesta ESTRUCTURADA en formato JSON puro.
        
        El JSON debe tener exactamente estas 3 claves:
        1. "summary": Un resumen ejecutivo claro y denso de 2-3 párrafos en español.
        2. "keyPoints": Una lista markdown de los 5-7 puntos clave o hallazgos más importantes.
        3. "suggestedTags": Una lista de cadenas de texto (strings) con 3 a 5 etiquetas relevantes sobre el tema.

        TEXTO A ANALIZAR:
        ${text.substring(0, 30000)}
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
          throw new Error(`Modelo ${model} falló (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!rawText) throw new Error(`El modelo ${model} respondió vacío.`);

      // ¡ÉXITO! Si llegamos aquí, funcionó. Devolvemos la respuesta.
      return res.status(200).json(JSON.parse(rawText));

    } catch (error) {
      console.error(error.message);
      lastError = error.message;
      // Si falla, el bucle 'for' continuará automáticamente con el siguiente modelo de la lista
    }
  }

  // SI LLEGAMOS AQUÍ, TODOS LOS MODELOS FALLARON
  return res.status(500).json({ 
    error: `No se pudo generar el resumen. Se probaron 4 modelos y todos fallaron. Último error: ${lastError}`
  });
}
