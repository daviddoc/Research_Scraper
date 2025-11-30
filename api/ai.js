export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta API Key' });

  try {
    // 1. PREGUNTAMOS A GOOGLE: "¿QUÉ MODELOS TENGO?"
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
        const txt = await response.text();
        return res.status(500).json({ error: `Error listando modelos: ${txt}` });
    }

    const data = await response.json();

    // 2. FILTRAMOS SOLO LOS QUE SIRVEN PARA GENERAR TEXTO
    // Buscamos modelos que soporten "generateContent"
    const availableModels = data.models
        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
        .map(m => m.name) // Nos quedamos solo con el nombre (ej: models/gemini-pro)
        .join(',\n'); // Los unimos con saltos de línea para que los leas bien

    // 3. ENVIAMOS LA LISTA COMO ERROR PARA QUE TE SALGA EN EL POPUP
    return res.status(500).json({ 
        error: `¡DIAGNÓSTICO ÉXITOSO! TUS MODELOS SON:\n\n${availableModels}\n\n(Haz captura de esto y pásamelo)` 
    });

  } catch (error) {
    return res.status(500).json({ error: `Error grave: ${error.message}` });
  }
}
