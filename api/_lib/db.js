import { createClient } from '@supabase/supabase-js'

let _client = null

export function db() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY

  if (!url) throw new Error('Env var SUPABASE_URL no definida en Vercel')
  if (!key) throw new Error('Env var SUPABASE_SERVICE_KEY no definida en Vercel')
  if (!url.startsWith('https://')) throw new Error(`SUPABASE_URL inválida: "${url.slice(0,30)}"`)

  if (!_client) {
    _client = createClient(url, key, {
      auth: { persistSession: false }
    })
  }
  return _client
}
