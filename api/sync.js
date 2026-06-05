import { db } from './_lib/db.js'
import { authMiddleware } from './_lib/jwt.js'
import { loginTopF2F, fetchIndivHtml, discoverTeamUrl, fetchAllTeamSocios, parseProductionTable } from './_lib/topf2f.js'

async function getVisibleUserIds(supabase, userId, role) {
  if (role === 99) return null
  try {
    const { data: self } = await supabase.from('users').select('es_raiz').eq('id', userId).single()
    if (self?.es_raiz) return null
  } catch {}
  const { data: rows } = await supabase.from('users').select('id, parent_id')
  const visible = new Set([userId])
  let changed = true
  while (changed) {
    changed = false
    for (const u of rows || []) {
      if (u.parent_id && visible.has(u.parent_id) && !visible.has(u.id)) {
        visible.add(u.id); changed = true
      }
    }
  }
  return [...visible]
}

// Fetch + parse one topf2f account's production — all pages.
// Also extracts the account owner's own captador_nombre from the individual page.
async function syncAccount(topf2f_user, topf2f_pass_b64) {
  const pass    = Buffer.from(topf2f_pass_b64, 'base64').toString('utf8')
  const cookies = await loginTopF2F(topf2f_user, pass)
  const indivHtml = await fetchIndivHtml(cookies)
  const teamUrl   = discoverTeamUrl(indivHtml)

  // Extract the account owner's own captador_nombre from their individual page.
  // On the individual page, every row belongs to the owner, so the first row's
  // captador_nombre is the owner's name as it appears in topf2f.
  const { socios: indivSocios } = parseProductionTable(indivHtml)
  const ownerCaptadorNombre = indivSocios[0]?.captador_nombre || null

  // Prefer team production (all-pages) over individual page.
  if (teamUrl) {
    const teamSocios = await fetchAllTeamSocios(cookies, '2024-01-01', '2026-12-31', teamUrl)
    if (teamSocios?.length) return { socios: teamSocios, hasTeam: true, ownerCaptadorNombre }
  }

  // Fallback: individual production page
  return { socios: indivSocios, hasTeam: false, ownerCaptadorNombre }
}

export const config = { maxDuration: 120 }

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json')
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const claim = authMiddleware(req)
  if (!claim) return res.status(401).json({ error: 'No autorizado' })

  const supabase = db()

  try {
    const visibleIds = await getVisibleUserIds(supabase, claim.id, claim.role)

    let credQuery = supabase.from('users')
      .select('id, topf2f_user, topf2f_pass')
      .not('topf2f_user', 'is', null)
      .not('topf2f_pass', 'is', null)
    if (visibleIds) credQuery = credQuery.in('id', visibleIds)

    const { data: accounts } = await credQuery
    if (!accounts?.length) return res.status(400).json({ error: 'No tienes credenciales de topf2f configuradas.' })

    console.log(`[sync] syncing ${accounts.length} account(s)`)

    // Sync all accounts in parallel
    const results = await Promise.allSettled(
      accounts.map(a => syncAccount(a.topf2f_user, a.topf2f_pass))
    )

    // ── Build captadorMap ──────────────────────────────────────────────────
    // Priority (highest wins): topf2f_captador_nombre > ownerCaptadorNombre > nombre+apellidos
    //
    // All CRM users with a name are candidates for auto-matching.
    // Root users (topf2f_user set) don't have topf2f_captador_nombre, so we
    // auto-discover their topf2f name from the individual production page.
    const { data: allUsers } = await supabase
      .from('users').select('id, nombre, apellidos, topf2f_captador_nombre')
    const captadorMap = {}

    // Tier 1 (lowest): auto-match by CRM nombre+apellidos
    for (const u of allUsers || []) {
      if (!u.nombre) continue
      const fullName = `${u.nombre} ${u.apellidos || ''}`.toLowerCase().trim()
      const firstName = u.nombre.toLowerCase().trim()
      // Only add if not already mapped (topf2f_captador_nombre takes priority below)
      if (fullName && !captadorMap[fullName]) captadorMap[fullName] = u.id
      if (firstName && !captadorMap[firstName]) captadorMap[firstName] = u.id
    }

    // Tier 2: explicit topf2f_captador_nombre (overrides auto-match)
    for (const u of allUsers || []) {
      if (u.topf2f_captador_nombre)
        captadorMap[u.topf2f_captador_nombre.toLowerCase().trim()] = u.id
    }

    // Tier 3 (highest): auto-discovered owner names from individual pages
    for (let i = 0; i < accounts.length; i++) {
      const r = results[i]
      if (r.status !== 'rejected' && r.value?.ownerCaptadorNombre) {
        const key = r.value.ownerCaptadorNombre.toLowerCase().trim()
        captadorMap[key] = accounts[i].id  // root user is the owner
        console.log(`[sync] owner name auto-discovered: "${r.value.ownerCaptadorNombre}" → account ${accounts[i].topf2f_user}`)
      }
    }
    // ───────────────────────────────────────────────────────────────────────

    // Merge socios across all accounts
    const sociosMap = {}
    let anyTeam = false
    const accountCounts = []
    for (let i = 0; i < accounts.length; i++) {
      const r = results[i]
      const accountOwnerId = accounts[i].id
      const user = accounts[i].topf2f_user
      if (r.status === 'rejected') {
        console.warn('[sync] account failed:', r.reason?.message)
        accountCounts.push(`${user}:ERR`)
        continue
      }
      if (r.value.hasTeam) anyTeam = true
      accountCounts.push(`${user}:${r.value.socios.length}`)
      for (const s of r.value.socios) {
        const prev = sociosMap[s.num_formulario]
        sociosMap[s.num_formulario] = prev ? {
          ...prev, ...s,
          fecha_nacimiento: s.fecha_nacimiento || prev.fecha_nacimiento || null,
          sexo: s.sexo || prev.sexo || null,
          nif:  s.nif  || prev.nif  || null,
          _account_owner_id: prev._account_owner_id,
        } : { ...s, _account_owner_id: accountOwnerId }
      }
    }

    const socios = Object.values(sociosMap)
    console.log(`[sync] total merged socios=${socios.length}`)

    if (socios.length === 0) {
      return res.status(200).json({ ok: true, new: 0, updated: 0, total: 0, debug: 'Sin socios en producción.' })
    }

    // Fetch existing DB records
    const nums = socios.map(s => s.num_formulario)
    const { data: existingRows } = await supabase
      .from('socios').select('num_formulario, fecha_nacimiento, sexo, captador_id, nif').in('num_formulario', nums)
    const existingMap = {}
    for (const row of existingRows || []) existingMap[row.num_formulario] = row
    const existingNums = new Set(Object.keys(existingMap))

    // Build upsert records
    const records = socios.map(s => {
      const ex = existingMap[s.num_formulario]

      // Attribution priority:
      // 1. captador_nombre matched to a CRM user (via topf2f_captador_nombre, owner auto-discovery, or nombre)
      // 2. The CRM user who owns the topf2f account (ensures only truly unmatched socios fall here)
      // NOTE: we intentionally do NOT fall back to ex?.captador_id — previous syncs may have set wrong
      // attributions (all falling to account_owner) and we need each sync to re-attribute cleanly.
      const matchedByName = s.captador_nombre && captadorMap[s.captador_nombre.toLowerCase().trim()]
      const captadorId = matchedByName || s._account_owner_id

      const { captador_nombre, _account_owner_id, ...rest } = s
      return {
        ...rest,
        captador_id: captadorId,
        last_sync: new Date().toISOString(),
        fecha_nacimiento: s.fecha_nacimiento || ex?.fecha_nacimiento || null,
        sexo: s.sexo || ex?.sexo || null,
        nif:  s.nif  || ex?.nif  || null,
      }
    })

    const newCount     = records.filter(r => !existingNums.has(r.num_formulario)).length
    const updatedCount = records.length - newCount

    // Upsert in chunks of 200
    const CHUNK = 200
    for (let ci = 0; ci < records.length; ci += CHUNK) {
      const chunk = records.slice(ci, ci + CHUNK)
      const { error: upsertErr } = await supabase
        .from('socios').upsert(chunk, { onConflict: 'num_formulario' })
      if (upsertErr) {
        console.error(`[sync] upsert chunk ${ci}-${ci + chunk.length} error:`, upsertErr.message)
        throw new Error('Upsert error: ' + upsertErr.message)
      }
    }

    const debugParts = []
    if (anyTeam) debugParts.push('equipo')
    debugParts.push(accountCounts.join(', '))
    const newlyLinked = records.filter(r => r.captador_id && !existingMap[r.num_formulario]?.captador_id).length
    if (newlyLinked > 0) debugParts.push(`${newlyLinked} enlazados`)

    // Log attribution breakdown for verification
    const byOwner = {}
    for (const r of records) {
      byOwner[r.captador_id] = (byOwner[r.captador_id] || 0) + 1
    }
    console.log('[sync] attribution breakdown:', JSON.stringify(byOwner))

    return res.status(200).json({
      ok: true, new: newCount, updated: updatedCount, total: socios.length,
      ...(debugParts.length ? { debug: debugParts.join(' · ') } : {})
    })

  } catch (err) {
    console.error('[sync] fatal error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
