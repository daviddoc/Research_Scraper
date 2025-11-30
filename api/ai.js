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

    // SELECCIÓN DE PROVEEDOR
    if (preferredProvider === 'google' && keys.google) {
        result = await callGoogle(keys.google, text);
    } 
    else if (preferredProvider === 'groq' && keys.groq) {
        result = await callGroq(keys.groq, text);
    }
    else if (preferredProvider === 'sambanova' && keys.sambanova) {
        result = await callSambaNova(keys.sambanova, text);
    }
    else if (preferredProvider === 'cohere' && keys.cohere) {
        result = await callCohere(keys.cohere, text);
    }
    else {
        // Fallback automático
        if (keys.google) result = await callGoogle(keys.google, text);
        else if (keys.groq) result = await callGroq(keys.groq, text);
        else throw new Error("No hay proveedores configurados o seleccionados.");
    }

    return res.status(200).json(result);

  } catch (e) {
    console.error("Error en AI Handler:", e);
    return res.status(500).json({ error: e.message });
  }
}

// --- HERRAMIENTA DE LIMPIEZA ---
function cleanAndParseJSON(rawText) {
    if (!rawText) throw new Error("La IA devolvió una respuesta vacía.");
    try { return JSON.parse(rawText); } catch (e) {}
    const firstBrace = rawText.indexOf('{');
    const lastBrace = rawText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
        const jsonCandidate = rawText.substring(firstBrace, lastBrace + 1);
        try {
            return JSON.parse(jsonCandidate);
        } catch (e) {
            try {
                const cleaned = jsonCandidate.replace(/[\n\r\t]/g, ' '); 
                return JSON.parse(cleaned);
            } catch (e2) {}
        }
    }
    throw new Error(`JSON inválido. Respuesta: ${rawText.substring(0, 100)}...`);
}

// --- PROVEEDORES ACTUALIZADOS ---

// 1. GOOGLE (Gemini 2.0)
async function callGoogle(key, text) {
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash'];
  for (const model of models) {
    try {
      const prompt = `Analiza y responde SOLO JSON: { "summary": "...", "keyPoints": "...", "suggestedTags": [] }. TEXTO: ${text.substring(0, 30000)}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (e) { continue; }
  }
  throw new Error("Gemini falló.");
}

// 2. GROQ (Llama 3.3 70B - Muy Rápido)
async function callGroq(key, text) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
        model: 'llama-3.3-70b-versatile', 
        messages: [{ role: "user", content: `Analiza y devuelve JSON: { "summary": "...", "keyPoints": "...", "suggestedTags": [] }. TEXTO: ${text.substring(0, 15000)}` }], 
        response_format: { type: "json_object" } 
    })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// 3. SAMBANOVA (Llama 3.1 405B - El Gigante "Brainiac")
// Nota: Qwen fue retirado, usamos el 405B que es el modelo open source más inteligente del mundo ahora mismo.
async function callSambaNova(key, text) {
  const prompt = `
    Eres un analista experto. Tu tarea es analizar el texto académico proporcionado.
    IMPORTANTE: Tu respuesta debe ser ESTRICTAMENTE un objeto JSON válido. NO escribas introducciones.
    Formato: { "summary": "Resumen en español", "keyPoints": "Lista markdown", "suggestedTags": ["tag1"] }
    TEXTO: ${text.substring(0, 10000)}`; 
    
  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "Meta-Llama-3.1-405B-Instruct", // MODELO ACTUALIZADO Y MASIVO
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      top_p: 0.1
    })
  });

  if (!res.ok) throw new Error(`SambaNova Error: ${await res.text()}`);
  const data = await res.json();
  return cleanAndParseJSON(data.choices[0].message.content);
}

// 4. COHERE (Command R+ Actualizado)
async function callCohere(key, text) {
  const res = await fetch('https://api.cohere.com/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "command-r-plus-08-2024", // MODELO ACTUALIZADO CON FECHA
      message: `Analiza este texto. Devuelve SOLO un objeto JSON con: summary (español), keyPoints (markdown), suggestedTags (array). TEXTO: ${text.substring(0, 20000)}`,
      preamble: "Eres un robot que SOLO habla JSON. No digas 'Aquí tienes'. Solo JSON."
    })
  });

  if (!res.ok) throw new Error(`Cohere Error: ${await res.text()}`);
  const data = await res.json();
  return cleanAndParseJSON(data.text);
}
