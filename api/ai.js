export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { text, preferredProvider } = req.body;
  if (!text) return res.status(400).json({ error: 'No hay texto.' });

  // RECUPERAR CLAVES
  const keys = {
    google: process.env.GEMINI_API_KEY,
    groq: process.env.GROQ_API_KEY,
    sambanova: process.env.SAMBANOVA_API_KEY,
    cohere: process.env.COHERE_API_KEY
  };

  // --- LÓGICA DE SELECCIÓN (SELECTOR) ---
  if (preferredProvider) {
    try {
      console.log(`Solicitado proveedor: ${preferredProvider}`);
      if (preferredProvider === 'google' && keys.google) return res.status(200).json(await callGoogle(keys.google, text));
      if (preferredProvider === 'groq' && keys.groq) return res.status(200).json(await callGroq(keys.groq, text));
      if (preferredProvider === 'sambanova' && keys.sambanova) return res.status(200).json(await callSambaNova(keys.sambanova, text));
      if (preferredProvider === 'cohere' && keys.cohere) return res.status(200).json(await callCohere(keys.cohere, text));
      
      throw new Error(`El proveedor ${preferredProvider} no está configurado o falló.`);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // --- MODO AUTOMÁTICO (CASCADA GRATUITA) ---
  // Orden: Google -> SambaNova (Qwen) -> Groq (Llama) -> Cohere
  let lastError = "";

  if (keys.google) {
    try { return res.status(200).json(await callGoogle(keys.google, text)); } 
    catch (e) { lastError += `Google: ${e.message}; `; }
  }

  if (keys.sambanova) {
    try { return res.status(200).json(await callSambaNova(keys.sambanova, text)); } 
    catch (e) { lastError += `SambaNova: ${e.message}; `; }
  }

  if (keys.groq) {
    try { return res.status(200).json(await callGroq(keys.groq, text)); } 
    catch (e) { lastError += `Groq: ${e.message}; `; }
  }

  if (keys.cohere) {
    try { return res.status(200).json(await callCohere(keys.cohere, text)); } 
    catch (e) { lastError += `Cohere: ${e.message}; `; }
  }

  return res.status(500).json({ error: `Todos los proveedores gratuitos fallaron. Log: ${lastError}` });
}

// ==========================================
//  FUNCIONES DE PROVEEDORES
// ==========================================

// 1. GOOGLE (Gemini 2.0 Flash/Pro)
async function callGoogle(key, text) {
  const models = ['gemini-2.0-flash', 'gemini-2.0-pro-exp-02-05', 'gemini-1.5-pro'];
  for (const model of models) {
    try {
      const prompt = `Analiza y responde SOLO JSON: { "summary": "Resumen ejecutivo denso (Español)", "keyPoints": "Lista markdown 5 puntos", "suggestedTags": ["tag1"] }. TEXTO: ${text.substring(0, 30000)}`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      return JSON.parse(data.candidates[0].content.parts[0].text);
    } catch (e) { continue; }
  }
  throw new Error("Gemini falló");
}

// 2. GROQ (Llama 3.3)
async function callGroq(key, text) {
  const prompt = `Analiza. RESPONDE SOLO JSON: { "summary": "...", "keyPoints": "...", "suggestedTags": [] }. TEXTO: ${text.substring(0, 15000)}`;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: "user", content: prompt }], response_format: { type: "json_object" } })
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

// 3. SAMBANOVA (Qwen 2.5 - La alternativa China potente)
async function callSambaNova(key, text) {
  const prompt = `
    Eres un analista experto. Analiza el texto.
    Tu salida debe ser ÚNICAMENTE un objeto JSON válido.
    Estructura: { "summary": "Resumen analítico en Español", "keyPoints": "Lista markdown", "suggestedTags": ["tag"] }.
    TEXTO: ${text.substring(0, 15000)}`;
    
  const res = await fetch('https://api.sambanova.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "Qwen2.5-72B-Instruct", // Modelo Chino Top Tier
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1
      // SambaNova no soporta siempre "json_object" nativo, confiamos en el prompt
    })
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  let content = data.choices[0].message.content;
  
  // Limpieza manual de JSON por si Qwen habla demasiado
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Qwen no devolvió JSON puro");
  return JSON.parse(jsonMatch[0]);
}

// 4. COHERE (Command R+ - Especialista en Resúmenes)
async function callCohere(key, text) {
  const res = await fetch('https://api.cohere.com/v1/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "command-r-plus",
      message: `Analiza este texto y extrae un JSON con: summary (en español), keyPoints (markdown), suggestedTags (array). TEXTO: ${text.substring(0, 20000)}`,
      preamble: "Eres un sistema que SOLO responde con JSON válido. Sin texto adicional."
    })
  });

  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  let content = data.text;
  
  // Limpieza de JSON para Cohere
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Cohere no devolvió JSON puro");
  return JSON.parse(jsonMatch[0]);
}
