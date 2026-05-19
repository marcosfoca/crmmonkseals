import { db } from '../_lib/db.js'

// Converts DD/MM/YYYY → YYYY-MM-DD. Returns null for invalid input.
function parseNumdir(numdir) {
  if (!numdir) return null
  const s = numdir.trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = parseInt(m[1]), mo = parseInt(m[2]), y = parseInt(m[3])
  if (y < 1900 || y > 2020 || mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
}

// Called by the scanner after extracting form data via Gemini.
// Saves fecha_nacimiento and sexo for any socios matching the given NIF.
// No auth required — the scanner has no JWT. Risk is low (birth dates only).
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { nif, numdir, sexo } = req.body || {}

  const cleanNif = (nif || '').replace(/[.\-\s]/g, '').toUpperCase().trim()
  if (!cleanNif || cleanNif.length < 7) return res.status(400).json({ error: 'NIF inválido' })

  const fecha_nacimiento = parseNumdir(numdir)
  if (!fecha_nacimiento && !sexo) return res.status(400).json({ error: 'Sin datos útiles' })

  try {
    const supabase = db()
    const updates = {}
    if (fecha_nacimiento) updates.fecha_nacimiento = fecha_nacimiento
    if (sexo === '1' || sexo === 'Hombre') updates.sexo = 'Hombre'
    else if (sexo === '2' || sexo === 'Mujer') updates.sexo = 'Mujer'

    const { data, error: updateErr } = await supabase
      .from('socios')
      .update(updates)
      .eq('nif', cleanNif)
      .is('fecha_nacimiento', null)
      .select('id')

    if (updateErr) throw new Error(updateErr.message)
    return res.status(200).json({ ok: true, updated: data?.length ?? 0 })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
