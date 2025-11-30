export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { text, preferredProvider } = req.body;
  if (!text) return res.status(400).json({ error: 'No hay texto.' });

  const keys = {
    google: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    sambanova: process.env.SAMBANOVA_API_KEY,
    cohere: process.env.COHERE_API_KEY
  };

  try {
    let result;
    console.log(`🤖 Solicitando a: ${preferredProvider || 'Automático'}`);

    if (preferredProvider === 'google' && keys.google) result = await callGoogle(keys.google, text);
    else if (preferredProvider === 'groq' && keys.groq) result = await callGroq(keys.groq, text);
    else if (preferredProvider === 'sambanova' && keys.sambanova) result = await callSambaNova(keys.sambanova, text);
    else if (preferredProvider === 'cohere' && keys.cohere) result = await callCohere(keys.cohere, text);
    else {
        // Fallback automático
        if (keys.google) result = await callGoogle(keys.google, text);
        else if (keys.groq) result = await callGroq(keys.groq, text);
        else throw new Error("No hay proveedores configurados.");
    }

    return res.status(200).json(result);

  } catch (e) {
    console.error("Error Handler:", e);
    return res.status(500).json({ error: e.message });
  }
}

// --- LIMPIEZA JSON ---
function cleanAndParseJSON(rawText) {
    if (!rawText) throw new Error("Respuesta vacía.");
    try { return JSON.parse(rawText); } catch (e) {}
    
    // Intentar extraer bloque JSON
    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first !== -1 && last !== -1) {
        try { return JSON.parse(rawText.substring(first, last + 1)); } catch (e) {}
    }
    // Fallback: limpieza agresiva de caracteres de control
    try { return JSON.parse(rawText.replace(/[\n\r\t]/g, ' ')); } catch (e) {}
    
    throw new Error(`No se pudo leer el JSON: ${rawText.substring(0, 50)}...`);
}

// --- PROVEEDORES ---

// 1. GOOGLE
async function callGoogle(key, text) {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            contents: [{ parts: [{ text: `Analiza y responde SOLO JSON válido: { "summary": "...", "keyPoints": "...", "suggestedTags": [] }. TEXTO: ${text.substring(0, 30000)}` }] }], 
            generationConfig: { responseMimeType: "application/json" } 
        })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (e) { continue; }
  }
  throw new Error("Gemini falló.");
}

// 2. GROQ
async function callGroq(key, text) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        model: 'llama-3.3-70b-versatile', 
        messages: [{ role: "user", content: `Devuelve JSON: { "summary": "...", "keyPoints": "...", "suggestedTags": [] }. TEXTO: ${text.substring(0, 15000)}` }], 
        response_format: { type: "json_object" } 
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// 3. SAMBANOVA (CORREGIDO: Usamos 70B que es estable en free tier)
async function callSambaNova(key, text) {
  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "Meta-Llama-3.1-70B-Instruct", // CAMBIO A MODELO ESTABLE
      messages: [{ role: "user", content: `Analiza el texto. Responde ÚNICAMENTE con JSON válido: { "summary": "Resumen español", "keyPoints": "Markdown list", "suggestedTags": ["tag"] }. TEXTO: ${text.substring(0, 10000)}` }],
      temperature: 0.1
    })
  });
  if (!res.ok) throw new Error(`SambaNova: ${await res.text()}`);
  const data = await res.json();
  return cleanAndParseJSON(data.choices[0].message.content);
}

// 4. COHERE (CORREGIDO: Versión específica)
async function callCohere(key, text) {
  const res = await fetch('https://api.cohere.com/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "command-r-plus-08-2024", // CAMBIO A ID EXACTO
      message: `Analiza y devuelve SOLO JSON puro: { "summary": "Español", "keyPoints": "Markdown", "suggestedTags": [] }. TEXTO: ${text.substring(0, 20000)}`
    })
  });
  if (!res.ok) throw new Error(`Cohere: ${await res.text()}`);
  const data = await res.json();
  return cleanAndParseJSON(data.text);
}
