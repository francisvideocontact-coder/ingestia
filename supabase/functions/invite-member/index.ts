import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { workspace_id, email, role } = await req.json()

    if (!workspace_id || !email || !role) {
      return new Response(JSON.stringify({ error: 'workspace_id, email et role sont requis' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const validRoles = ['admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return new Response(JSON.stringify({ error: 'Rôle invalide' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Vérifier que l'appelant est connecté ────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
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
    if (!user) {
      return new Response(JSON.stringify({ error: 'Non authentifié', detail: authError?.message }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Vérifier que l'appelant est owner ou admin du workspace ─────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: membership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .single()

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return new Response(JSON.stringify({ error: 'Accès refusé : vous devez être owner ou admin' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Envoyer l'invitation via Supabase Auth Admin ─────────────────────────
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('name')
      .eq('id', workspace_id)
      .single()

    const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: {
        workspace_id,
        role,
      },
      redirectTo: `${Deno.env.get('SITE_URL') ?? 'https://ingestia.vercel.app'}/dashboard`,
    })

    if (inviteError) {
      // Si l'utilisateur existe déjà, on peut l'ajouter directement
      if (inviteError.message?.includes('already been registered')) {
        return new Response(JSON.stringify({
          error: 'Cet email est déjà associé à un compte. Demandez à la personne de vous contacter pour qu\'on puisse l\'ajouter manuellement.',
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      throw inviteError
    }

    console.log(`Invitation envoyée à ${email} pour le workspace "${workspace?.name}" avec le rôle ${role}`)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('invite-member error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
