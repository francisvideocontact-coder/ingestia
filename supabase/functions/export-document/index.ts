import { createClient } from 'npm:@supabase/supabase-js@2'

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { document_id } = await req.json()
    if (!document_id) {
      return new Response(JSON.stringify({ error: 'document_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    )
    const { data: { user } } = await anonClient.auth.getUser(token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Admin client ─────────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Fetch document + vérifier membership ─────────────────────────────────
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('*, workspaces!inner(id, name, settings, workspace_members!inner(user_id))')
      .eq('id', document_id)
      .eq('workspaces.workspace_members.user_id', user.id)
      .single()

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (doc.status === 'exported') {
      return new Response(JSON.stringify({ error: 'Already exported' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const workspaceId = doc.workspace_id
    const workspaceName = doc.workspaces.name
    const workspaceSettings = doc.workspaces.settings as Record<string, unknown> | null

    // ── Fetch Google token ────────────────────────────────────────────────────
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_tokens')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single()

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Google Drive not connected for this workspace' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Refresh token si expiré ───────────────────────────────────────────────
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
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      accessToken = refreshData.access_token
      const newExpiry = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      await supabase
        .from('google_tokens')
        .update({ access_token: accessToken, expires_at: newExpiry, updated_at: new Date().toISOString() })
        .eq('workspace_id', workspaceId)
    }

    // ── Download depuis Supabase Storage ─────────────────────────────────────
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(doc.original_file_url)

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: 'Failed to download file: ' + downloadError?.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const filename = doc.final_filename ?? doc.original_filename
    const contentType = fileData.type || 'application/octet-stream'

    // ── Google Drive : déterminer le dossier de destination ──────────────────
    const configuredFolderId = workspaceSettings?.drive_folder_id as string | undefined
    const configuredFolderPath = workspaceSettings?.drive_folder_path as string | undefined

    let targetFolderId: string
    let driveFolderPath: string

    if (configuredFolderId) {
      // Dossier sélectionné via le picker → upload direct
      targetFolderId = configuredFolderId
      driveFolderPath = configuredFolderPath ?? configuredFolderId
    } else {
      // Fallback : créer la hiérarchie par défaut
      const defaultPath = `Qonto Connect Import - ${workspaceName}/Dropzone`
      const segments = defaultPath.split('/').map((s: string) => s.trim()).filter(Boolean)
      let parentId: string | null = null
      for (const segment of segments) {
        parentId = await findOrCreateFolder(accessToken, segment, parentId)
      }
      targetFolderId = parentId!
      driveFolderPath = defaultPath
    }

    // ── Upload vers Google Drive ──────────────────────────────────────────────
    const arrayBuffer = await fileData.arrayBuffer()
    const driveFileId = await uploadToDrive(accessToken, filename, contentType, arrayBuffer, targetFolderId)

    // ── INSERT export_log ─────────────────────────────────────────────────────
    await supabase
      .from('export_logs')
      .insert({
        document_id,
        drive_file_id: driveFileId,
        drive_folder_path: driveFolderPath,
        status: 'success',
      })

    // ── UPDATE document ───────────────────────────────────────────────────────
    await supabase
      .from('documents')
      .update({ status: 'exported', exported_at: new Date().toISOString() })
      .eq('id', document_id)

    return new Response(JSON.stringify({ drive_file_id: driveFileId, drive_folder_path: driveFolderPath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('export-document error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Helpers Google Drive ──────────────────────────────────────────────────────

async function findOrCreateFolder(accessToken: string, name: string, parentId: string | null): Promise<string> {
  // Chercher le dossier existant
  let q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  if (parentId) q += ` and '${parentId}' in parents`

  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const searchData = await searchRes.json()

  if (searchData.files?.length > 0) {
    return searchData.files[0].id
  }

  // Créer le dossier
  const body: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  }
  if (parentId) body.parents = [parentId]

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const createData = await createRes.json()
  if (!createRes.ok) throw new Error('Failed to create Drive folder: ' + JSON.stringify(createData))
  return createData.id
}

async function uploadToDrive(
  accessToken: string,
  filename: string,
  contentType: string,
  content: ArrayBuffer,
  folderId: string,
): Promise<string> {
  const metadata = {
    name: filename,
    parents: [folderId],
  }

  const boundary = '-------314159265358979323846'
  const delimiter = `\r\n--${boundary}\r\n`
  const closeDelimiter = `\r\n--${boundary}--`

  const metadataStr = JSON.stringify(metadata)
  const metadataPart = `${delimiter}Content-Type: application/json\r\n\r\n${metadataStr}`

  const metadataBytes = new TextEncoder().encode(metadataPart)
  const mediaHeader = new TextEncoder().encode(`${delimiter}Content-Type: ${contentType}\r\n\r\n`)
  const closeBytes = new TextEncoder().encode(closeDelimiter)

  const body = new Uint8Array(
    metadataBytes.length + mediaHeader.length + content.byteLength + closeBytes.length
  )
  let offset = 0
  body.set(metadataBytes, offset); offset += metadataBytes.length
  body.set(mediaHeader, offset); offset += mediaHeader.length
  body.set(new Uint8Array(content), offset); offset += content.byteLength
  body.set(closeBytes, offset)

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )
  const uploadData = await uploadRes.json()
  if (!uploadRes.ok) throw new Error('Failed to upload to Drive: ' + JSON.stringify(uploadData))
  return uploadData.id
}
