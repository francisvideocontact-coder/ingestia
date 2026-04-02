import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Catégories valides ────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  'REPAS', 'ALIMENTATION', 'LOGICIEL', 'LOYER', 'TELECOMMUNICATION',
  'MATERIEL', 'PRESTATION', 'MARKETING', 'DEPLACEMENT', 'ASSURANCE', 'AUTRES',
])

// Correspondances pour anciens noms ou mots-clés dans les noms de fichiers
const CATEGORY_ALIASES: Record<string, string> = {
  'TELECOM': 'TELECOMMUNICATION',
  'LOGICIELS': 'LOGICIEL',
  'FOURNITURES': 'MATERIEL',
  'FORMATION': 'AUTRES',
  'RESTAURANT': 'REPAS',
  'PRESTATAIRE': 'PRESTATION',
  'INTERNET': 'TELECOMMUNICATION',
  'FIBRE': 'TELECOMMUNICATION',
  'SAAS': 'LOGICIEL',
  'SNACK': 'ALIMENTATION',
  'COURSES': 'ALIMENTATION',
  'ASSURANCES': 'ASSURANCE',
  'GARANTIE': 'ASSURANCE',
}

// Marqueurs qui indiquent la fin du nom du fournisseur dans le nom de fichier
const TYPE_MARKERS = new Set(['FACT', 'FACTURE', 'JUSTIF', 'RECU', 'AVOIR', 'TICKET', 'NDF', 'CB'])

// ─── Parser de nom de fichier ──────────────────────────────────────────────────

interface ParsedFile {
  supplier: string
  category: string | null
}

function parseFilename(filename: string): ParsedFile | null {
  const base = filename.replace(/\.pdf$/i, '').replace(/\.jpg$/i, '').replace(/\.jpeg$/i, '').replace(/\.png$/i, '')
  const parts = base.split('_')

  // Doit commencer par une date YYYYMMDD
  if (!/^\d{8}$/.test(parts[0])) return null

  // Retirer la date
  parts.shift()

  // Retirer le préfixe NDF si présent
  if (parts[0]?.toUpperCase() === 'NDF') parts.shift()

  if (parts.length === 0) return null

  // Trouver où s'arrête le nom du fournisseur (avant le premier marqueur de type)
  const markerIndex = parts.findIndex((p) => TYPE_MARKERS.has(p.toUpperCase()))

  let supplierParts: string[]
  let restParts: string[]

  if (markerIndex > 0) {
    supplierParts = parts.slice(0, markerIndex)
    restParts = parts.slice(markerIndex + 1)
  } else if (markerIndex === 0) {
    return null // pas de fournisseur identifiable
  } else {
    // Pas de marqueur → premier token = fournisseur
    supplierParts = [parts[0]]
    restParts = parts.slice(1)
  }

  // Normaliser le nom du fournisseur
  const supplier = supplierParts
    .join('_')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toUpperCase()

  if (!supplier) return null

  // Chercher la catégorie dans les parties restantes
  let category: string | null = null
  for (const part of restParts) {
    const upper = part.toUpperCase()
    if (VALID_CATEGORIES.has(upper)) {
      category = upper
      break
    }
    if (CATEGORY_ALIASES[upper]) {
      category = CATEGORY_ALIASES[upper]
      break
    }
    // Cherche aussi dans les parties composées (ex: INTERNET-FIBRE)
    const subParts = upper.split(/[-\s]/)
    for (const sub of subParts) {
      if (VALID_CATEGORIES.has(sub)) { category = sub; break }
      if (CATEGORY_ALIASES[sub]) { category = CATEGORY_ALIASES[sub]; break }
    }
    if (category) break
  }

  return { supplier, category }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { workspace_id, folder_id } = await req.json()
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    console.log('[scan-drive-suppliers] auth header present:', !!authHeader)
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: 'no_auth_header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token)
    console.log('[scan-drive-suppliers] user:', user?.id ?? null, 'authError:', authError?.message ?? null)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', detail: authError?.message ?? 'no_user' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Vérifier membership ──────────────────────────────────────────────────
    const { count } = await supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)

    if (!count || count === 0) {
      return new Response(JSON.stringify({ error: 'access_denied' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch & refresh Google token ─────────────────────────────────────────
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_tokens')
      .select('*')
      .eq('workspace_id', workspace_id)
      .single()

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Google Drive not connected' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let accessToken = tokenRow.access_token
    if (new Date(tokenRow.expires_at) <= new Date()) {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          refresh_token: tokenRow.refresh_token,
          client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
          grant_type: 'refresh_token',
        }),
      })
      const refreshData = await refreshRes.json()
      if (!refreshRes.ok || !refreshData.access_token) {
        return new Response(JSON.stringify({ error: 'Failed to refresh Google token' }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      accessToken = refreshData.access_token
      const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      await supabase
        .from('google_tokens')
        .update({ access_token: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspace_id)
    }

    // ── Lister les fichiers PDF ───────────────────────────────────────────────
    const allFiles: { name: string }[] = []

    if (folder_id) {
      // Scan récursif depuis un dossier spécifique (BFS)
      const queue: string[] = [folder_id]
      while (queue.length > 0) {
        const currentFolder = queue.shift()!
        let pageToken: string | null = null
        do {
          const params = new URLSearchParams({
            q: `'${currentFolder}' in parents and trashed=false`,
            fields: 'nextPageToken,files(id,name,mimeType)',
            pageSize: '1000',
          })
          if (pageToken) params.set('pageToken', pageToken)
          const res = await fetch(
            `https://www.googleapis.com/drive/v3/files?${params}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          )
          const data = await res.json()
          if (!res.ok) break
          for (const file of data.files ?? []) {
            if (file.mimeType === 'application/pdf') {
              allFiles.push({ name: file.name })
            } else if (file.mimeType === 'application/vnd.google-apps.folder') {
              queue.push(file.id)
            }
          }
          pageToken = data.nextPageToken ?? null
        } while (pageToken)
      }
    } else {
      // Scan de tout le Drive
      let pageToken: string | null = null
      do {
        const params = new URLSearchParams({
          q: `mimeType='application/pdf' and trashed=false`,
          fields: 'nextPageToken,files(name)',
          pageSize: '1000',
          orderBy: 'name',
        })
        if (pageToken) params.set('pageToken', pageToken)
        const listRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        )
        const listData = await listRes.json()
        if (!listRes.ok) {
          return new Response(JSON.stringify({ error: 'drive_error', detail: JSON.stringify(listData) }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        allFiles.push(...(listData.files ?? []))
        pageToken = listData.nextPageToken ?? null
      } while (pageToken)
    }

    // ── Parser les noms de fichiers ───────────────────────────────────────────
    const supplierMap = new Map<string, string>() // supplier → category

    for (const file of allFiles) {
      const parsed = parseFilename(file.name)
      if (!parsed) continue
      // Si on a déjà ce fournisseur avec une catégorie, ne pas écraser
      if (supplierMap.has(parsed.supplier) && !supplierMap.get(parsed.supplier)) continue
      if (parsed.category || !supplierMap.has(parsed.supplier)) {
        supplierMap.set(parsed.supplier, parsed.category ?? '')
      }
    }

    if (supplierMap.size === 0) {
      return new Response(JSON.stringify({ imported: 0, message: 'Aucun fournisseur trouvé dans les noms de fichiers' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Upsert dans supplier_categories ──────────────────────────────────────
    const rows = Array.from(supplierMap.entries())
      .filter(([, cat]) => cat) // seulement ceux avec une catégorie connue
      .map(([supplier, category]) => ({
        workspace_id,
        supplier_name: supplier,
        category,
        source: 'drive_scan',
      }))

    const withoutCategory = Array.from(supplierMap.entries())
      .filter(([, cat]) => !cat)
      .map(([supplier]) => ({
        workspace_id,
        supplier_name: supplier,
        category: 'AUTRES',
        source: 'drive_scan',
      }))

    const allRows = [...rows, ...withoutCategory]

    // Upsert par batch de 100
    let imported = 0
    for (let i = 0; i < allRows.length; i += 100) {
      const batch = allRows.slice(i, i + 100)
      const { error: upsertError } = await supabase
        .from('supplier_categories')
        .upsert(batch, { onConflict: 'workspace_id,supplier_name', ignoreDuplicates: false })

      if (!upsertError) imported += batch.length
    }

    return new Response(JSON.stringify({
      imported,
      total_files: allFiles.length,
      suppliers_found: supplierMap.size,
      with_category: rows.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('scan-drive-suppliers error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
