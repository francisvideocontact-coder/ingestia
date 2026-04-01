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
    const { candidate_id } = await req.json()
    if (!candidate_id) {
      return new Response(JSON.stringify({ error: 'candidate_id required' }), {
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

    // ── Admin client ────────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Fetch candidate + workspace (verify membership) ─────────────────────
    const { data: candidate, error: candidateError } = await supabase
      .from('email_candidates')
      .select('*, email_connections!inner(workspace_id, workspace_members!inner(user_id))')
      .eq('id', candidate_id)
      .eq('email_connections.workspace_members.user_id', user.id)
      .single()

    if (candidateError || !candidate) {
      return new Response(JSON.stringify({ error: 'Candidate not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (candidate.status === 'ingested') {
      return new Response(JSON.stringify({ error: 'Already ingested' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const workspaceId = candidate.email_connections.workspace_id
    const storagePath: string = candidate.attachment_url

    // ── Download from email-staging ─────────────────────────────────────────
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('email-staging')
      .download(storagePath)

    if (downloadError || !fileData) {
      return new Response(JSON.stringify({ error: 'Failed to download staging file: ' + downloadError?.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Determine filename and content type ─────────────────────────────────
    const stagingFilename = storagePath.split('/').pop() ?? 'document'
    // Remove leading uid_ prefix if present (format: uid_subject.ext)
    const originalFilename = stagingFilename.replace(/^\d+_/, '')
    const contentType = fileData.type || getMimeFromFilename(originalFilename)

    // ── Upload to documents bucket ──────────────────────────────────────────
    const documentId = crypto.randomUUID()
    const documentStoragePath = `${workspaceId}/${documentId}/${sanitizeFilename(originalFilename)}`

    const arrayBuffer = await fileData.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(documentStoragePath, arrayBuffer, {
        contentType,
        upsert: false,
      })

    if (uploadError) {
      return new Response(JSON.stringify({ error: 'Failed to upload document: ' + uploadError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Create document record ──────────────────────────────────────────────
    const { error: insertError } = await supabase
      .from('documents')
      .insert({
        id: documentId,
        workspace_id: workspaceId,
        uploaded_by: user.id,
        original_file_url: documentStoragePath,
        original_filename: originalFilename,
        status: 'pending',
      })

    if (insertError) {
      return new Response(JSON.stringify({ error: 'Failed to create document: ' + insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Mark candidate as ingested ──────────────────────────────────────────
    await supabase
      .from('email_candidates')
      .update({ status: 'ingested' })
      .eq('id', candidate_id)

    // ── Fire-and-forget: trigger analysis ───────────────────────────────────
    supabase.functions.invoke('analyze-document', {
      body: { document_id: documentId },
    }).catch((err) => console.error('Analysis trigger failed:', err))

    return new Response(JSON.stringify({ document_id: documentId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('ingest-email-candidate error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
    heif: 'image/heif',
  }
  return map[ext] ?? 'application/octet-stream'
}

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
}
