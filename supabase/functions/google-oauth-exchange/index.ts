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
    const { code, workspace_id } = await req.json()
    if (!code || !workspace_id) {
      return new Response(JSON.stringify({ error: 'code and workspace_id required' }), {
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

    // ── Vérifier que l'user est owner/admin du workspace ─────────────────────
    const { data: member, error: memberError } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .in('role', ['owner', 'admin'])
      .single()

    if (memberError || !member) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Échanger le code contre des tokens Google ─────────────────────────────
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')!

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Google token exchange error:', tokenData)
      return new Response(JSON.stringify({ error: 'Failed to exchange code: ' + (tokenData.error_description ?? tokenData.error) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    // ── Récupérer le refresh_token existant si Google n'en renvoie pas ────────
    // (peut arriver lors d'une reconnexion même avec prompt=consent)
    let refreshToken = tokenData.refresh_token
    if (!refreshToken) {
      const { data: existing } = await supabase
        .from('google_tokens')
        .select('refresh_token')
        .eq('workspace_id', workspace_id)
        .single()
      refreshToken = existing?.refresh_token ?? null
    }

    if (!refreshToken) {
      return new Response(JSON.stringify({ error: 'Google n\'a pas fourni de refresh token. Déconnectez-vous et reconnectez-vous.' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Upsert google_tokens ──────────────────────────────────────────────────
    const { error: upsertError } = await supabase
      .from('google_tokens')
      .upsert({
        workspace_id,
        access_token: tokenData.access_token,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id' })

    if (upsertError) {
      return new Response(JSON.stringify({ error: 'Failed to save token: ' + upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('google-oauth-exchange error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
