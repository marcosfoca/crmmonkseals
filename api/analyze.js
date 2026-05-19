export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key no configurada' })

  const { base64 } = req.body
  if (!base64) return res.status(400).json({ error: 'Falta imagen' })

  const prompt = [
    'Analiza esta imagen de un formulario de donación/captación en papel.',
    'Extrae todos los datos legibles y devuelve ÚNICAMENTE un objeto JSON (sin markdown, sin texto extra) con exactamente estos campos:',
    '{',
    '  "nombre": "", "apellido1": "", "apellido2": "",',
    '  "nif": "", "numdir": "",',
    '  "tlf1": "", "tlf2": "", "movil1": "", "movil2": "",',
    '  "email": "",',
    '  "tipovia": "", "dirvia": "", "numvia": "",',
    '  "pisovia": "", "letravia": "", "comp15": "",',
    '  "cp": "", "dirvia2": "", "portalvia2b": "",',
    '  "iban_completo": "",',
    '  "importe": "", "dia_cargo": "", "periodo": "",',
    '  "sexo": "", "tipo_socio": "", "observaciones": ""',
    '}',
    'Reglas:',
    '- tipovia: Cl (calle), Av (avenida), Ps (paseo), Pz (plaza), Cm (camino), Cr (carretera)',
    '- numdir: fecha nacimiento en formato DD/MM/YYYY',
    '- nif: sin puntos ni guiones',
    '- importe: solo número (ej: "15")',
    '- dia_cargo: "01" o "10"',
    '- periodo: "0"=mensual,"1"=trimestral,"2"=semestral,"3"=anual,"4"=puntual',
    '- sexo: "1"=hombre,"2"=mujer',
    '- tipo_socio: "SOCIO" o "AUMENTO DE CUOTA" según casilla marcada',
    '- portalvia2b: nombre de provincia en español',
    '- Si un campo no es visible, deja ""',
    '- Devuelve SOLO el JSON.'
  ].join('\n')

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
          { text: prompt }
        ]}],
        generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
      })
    }
  )

  const data = await geminiRes.json()
  return res.status(geminiRes.status).json(data)
}
