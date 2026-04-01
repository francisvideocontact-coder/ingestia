import { createClient } from 'npm:@supabase/supabase-js@2'
// @ts-ignore — imapflow is a CommonJS npm package, types may not be perfect in Deno
import ImapFlow from 'npm:imapflow@1'

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExtensionFromMime(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
  }
  return map[mime.toLowerCase()] ?? 'bin'
}

const ACCEPTED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { connection_id } = await req.json()
    if (!connection_id) {
      return new Response(JSON.stringify({ error: 'connection_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Supabase admin client (service role) ────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Auth: verify user owns this connection ──────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
    ).auth.getUser(token)

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch connection + verify membership ────────────────────────────────
    const { data: connection, error: connError } = await supabase
      .from('email_connections')
      .select('*, workspace_members!inner(user_id)')
      .eq('id', connection_id)
      .eq('workspace_members.user_id', user.id)
      .single()

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const creds = connection.credentials as {
      host: string
      port: number
      secure: boolean
      user: string
      pass: string
    }

    // ── Connect to IMAP ─────────────────────────────────────────────────────
    const client = new ImapFlow({
      host: creds.host,
      port: creds.port,
      secure: creds.secure ?? true,
      auth: { user: creds.user, pass: creds.pass },
      logger: false,
    })

    await client.connect()

    let created = 0

    try {
      // Search INBOX for unseen messages in the last 30 days
      const lock = await client.getMailboxLock('INBOX')
      try {
        const since = new Date()
        since.setDate(since.getDate() - 30)

        const messages = client.fetch(
          { seen: false, since },
          { envelope: true, bodyStructure: true }
        )

        for await (const msg of messages) {
          const envelope = msg.envelope
          const structure = msg.bodyStructure

          // Find accounting attachments in this message
          const attachments = findAccountingAttachments(structure)
          if (attachments.length === 0) continue

          for (const part of attachments) {
            try {
              // Download attachment content
              const { content } = await client.download(String(msg.seq), part.part, { uid: false })
              const chunks: Uint8Array[] = []
              for await (const chunk of content) {
                chunks.push(chunk)
              }
              const buffer = mergeUint8Arrays(chunks)

              const ext = getExtensionFromMime(part.type)
              const sanitizedSubject = (envelope.subject ?? 'email')
                .replace(/[^a-zA-Z0-9]/g, '_')
                .slice(0, 40)
              const filename = `${sanitizedSubject}.${ext}`
              const storagePath = `${connection_id}/${msg.uid ?? Date.now()}_${filename}`

              // Upload to email-staging bucket
              const { error: uploadError } = await supabase.storage
                .from('email-staging')
                .upload(storagePath, buffer, {
                  contentType: part.type,
                  upsert: false,
                })

              if (uploadError) {
                // Skip if already exists
                if (!uploadError.message.includes('already exists')) {
                  console.error('Upload error:', uploadError.message)
                  continue
                }
              }

              // Check if candidate already exists for this path
              const { data: existing } = await supabase
                .from('email_candidates')
                .select('id')
                .eq('attachment_url', storagePath)
                .single()

              if (existing) continue

              // Insert email_candidate
              const sender = envelope.from?.[0]
                ? `${envelope.from[0].name ?? ''} <${envelope.from[0].address ?? ''}>`.trim()
                : 'Inconnu'

              const { error: insertError } = await supabase
                .from('email_candidates')
                .insert({
                  email_connection_id: connection_id,
                  subject: envelope.subject ?? '(sans objet)',
                  sender,
                  date: envelope.date?.toISOString() ?? new Date().toISOString(),
                  detected_type: 'attachment',
                  attachment_url: storagePath,
                  status: 'pending',
                })

              if (!insertError) created++
            } catch (partError) {
              console.error('Error processing attachment:', partError)
            }
          }
        }
      } finally {
        lock.release()
      }
    } finally {
      await client.logout()
    }

    return new Response(JSON.stringify({ created }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('scan-emails error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface BodyPart {
  part: string
  type: string
}

function findAccountingAttachments(structure: Record<string, unknown>, prefix = ''): BodyPart[] {
  const results: BodyPart[] = []
  if (!structure) return results

  const type = `${structure.type ?? ''}/${structure.subtype ?? ''}`.toLowerCase()
  const disposition = (structure.disposition as string | undefined)?.toLowerCase()
  const isAttachment = disposition === 'attachment' || (structure.filename != null)

  if (isAttachment && ACCEPTED_MIME.has(type.split(';')[0].trim())) {
    results.push({ part: prefix || '1', type: type.split(';')[0].trim() })
  }

  // Recurse into multipart
  const childParts = structure.childNodes as Record<string, unknown>[] | undefined
  if (Array.isArray(childParts)) {
    childParts.forEach((child, i) => {
      const childPrefix = prefix ? `${prefix}.${i + 1}` : `${i + 1}`
      results.push(...findAccountingAttachments(child, childPrefix))
    })
  }

  return results
}

function mergeUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) {
    merged.set(arr, offset)
    offset += arr.length
  }
  return merged
}
