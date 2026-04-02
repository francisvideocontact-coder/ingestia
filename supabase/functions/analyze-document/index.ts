import Anthropic from 'npm:@anthropic-ai/sdk@0.36.3'
import { createClient } from 'npm:@supabase/supabase-js@2'

// ─── CORS ─────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalysisResult {
  supplier: string | null
  date: string | null
  amount_ht: number | null
  amount_ttc: number | null
  vat_amount: number | null
  currency: string
  document_type: 'facture' | 'ndf' | 'ticket' | 'avoir' | null
  category: string | null
  confidence_scores: {
    supplier: number
    date: number
    amount_ht: number
    amount_ttc: number
    vat_amount: number
    document_type: number
    category: number
    overall: number
  }
}

// ─── Media type detection ─────────────────────────────────────────────────────

function getMediaType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/jpeg', // Supabase Storage converts HEIC to JPEG
    heif: 'image/jpeg',
  }
  return map[ext] ?? 'image/jpeg'
}

// ─── Nomenclature ─────────────────────────────────────────────────────────────

interface NomenclatureSettings {
  separator?: string
  case?: 'UPPER' | 'LOWER'
  ndf_prefix?: boolean
}

function generateFilename(result: AnalysisResult, settings?: NomenclatureSettings): string {
  const sep = settings?.separator ?? '_'
  const upper = settings?.case !== 'LOWER'
  const ndfPrefix = settings?.ndf_prefix ?? false
  const isNdf = result.document_type === 'ndf'

  const parts: string[] = []

  parts.push(result.date?.replace(/-/g, '') ?? 'XXXXXXXX')

  if (ndfPrefix && isNdf) {
    parts.push(upper ? 'NDF' : 'ndf')
  }

  parts.push(normalizeSegment(result.supplier ?? 'FOURNISSEUR', upper))

  if (!(ndfPrefix && isNdf)) {
    parts.push(upper
      ? (result.document_type ?? 'DOCUMENT').toUpperCase()
      : (result.document_type ?? 'document').toLowerCase()
    )
  }

  parts.push(normalizeSegment(result.category ?? 'CATEGORIE', upper))

  return parts.join(sep) + '.pdf'
}

function normalizeSegment(value: string, upper: boolean): string {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return upper ? normalized.toUpperCase() : normalized.toLowerCase()
}

// ─── Claude analysis prompt ───────────────────────────────────────────────────

const ANALYSIS_PROMPT = `Tu es un expert-comptable spécialisé dans l'analyse de documents comptables.

Analyse ce document et extrais les informations suivantes. Réponds UNIQUEMENT avec un JSON valide, sans texte avant ou après, sans backticks markdown.

Champs à extraire :
- supplier : nom exact du fournisseur/émetteur (ex: "AMAZON FR", "SNCF", "CARREFOUR")
- date : date du document au format YYYY-MM-DD (ex: "2025-02-22")
- currency : code ISO 4217 de la devise du document (ex: "EUR", "USD", "GBP", "CHF"). Par défaut "EUR" si non précisé.
- amount_ht : montant hors taxes dans la devise d'origine, nombre décimal (ex: 99.17), null si absent
- amount_ttc : montant toutes taxes comprises dans la devise d'origine, nombre décimal (ex: 119.00), null si absent
- vat_amount : montant de la TVA dans la devise d'origine, nombre décimal (ex: 19.83), null si absent
- document_type : type parmi exactement ["facture", "ndf", "ticket", "avoir"]
- category : catégorie parmi exactement ["REPAS", "ALIMENTATION", "LOGICIEL", "LOYER", "TELECOMMUNICATION", "MATERIEL", "PRESTATION", "MARKETING", "DEPLACEMENT", "ASSURANCE", "AUTRES"]
  Règles de catégorisation :
  · REPAS : restaurant, brasserie, café, repas d'affaires (ex: Neko Ramen, Basta Cosi, Au Fond du Jardin)
  · ALIMENTATION : supermarché, épicerie, boulangerie (achat snack/courses), courses alimentaires non-restaurant (ex: Monoprix, Carrefour, CRF City)
  · LOGICIEL : SaaS, abonnement logiciel, licence, outil en ligne (ex: Claap, Frame.io, Submagic, Lovable, ChatGPT, Yousign, Notion, Adobe)
  · LOYER : loyer, location de bureau, studio, espace de coworking
  · TELECOMMUNICATION : internet, fibre, téléphone, mobile (ex: Orange, SFR, Sosh, Bouygues)
  · MATERIEL : matériel informatique, photo/vidéo, équipements, câbles, accessoires (ex: Amazon, Apple, Fnac, Camshot, SmallRig)
  · PRESTATION : prestataire, freelance, consultant, agence, sous-traitant, post-production (ex: Hugo Bousquet, Nathan-Do)
  · MARKETING : publicité, marketing digital, communication, création graphique, stratégie (ex: Bidmetrics)
  · DEPLACEMENT : transport, taxi, VTC, train, avion, carburant, parking, péage, amende
  · ASSURANCE : assurance, mutuelle, garantie, RC Pro, protection juridique (ex: Alan, Apple Care, Orus)
  · AUTRES : tout ce qui ne correspond pas aux catégories ci-dessus
- confidence_scores : objet avec un score entier de 0 à 100 pour chaque champ ci-dessus (supplier, date, amount_ht, amount_ttc, vat_amount, document_type, category) + "overall" (confiance globale)

Règles :
- Si une valeur est illisible ou absente, mets null et un score de confiance bas (< 30)
- Les montants doivent être des nombres dans la devise d'origine du document (pas de conversion)
- La date doit être au format ISO YYYY-MM-DD
- Pour category, choisis la plus pertinente selon le contenu

Exemple de réponse attendue :
{
  "supplier": "AMAZON FR",
  "date": "2025-02-22",
  "currency": "EUR",
  "amount_ht": 99.17,
  "amount_ttc": 119.00,
  "vat_amount": 19.83,
  "document_type": "facture",
  "category": "MATERIEL",
  "confidence_scores": {
    "supplier": 95,
    "date": 98,
    "amount_ht": 88,
    "amount_ttc": 99,
    "vat_amount": 90,
    "document_type": 99,
    "category": 78,
    "overall": 92
  }
}`

// ─── Parse Claude response ────────────────────────────────────────────────────

function parseClaudeResponse(text: string): AnalysisResult {
  // Strip markdown code blocks if present
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  const parsed = JSON.parse(cleaned)

  // Validate and sanitize
  const validTypes = ['facture', 'ndf', 'ticket', 'avoir']
  const validCategories = ['REPAS', 'ALIMENTATION', 'LOGICIEL', 'LOYER', 'TELECOMMUNICATION', 'MATERIEL', 'PRESTATION', 'MARKETING', 'DEPLACEMENT', 'ASSURANCE', 'AUTRES']

  const rawCurrency = typeof parsed.currency === 'string' ? parsed.currency.trim().toUpperCase() : 'EUR'
  const currency = /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : 'EUR'

  return {
    supplier: typeof parsed.supplier === 'string' ? parsed.supplier.trim() : null,
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    currency,
    amount_ht: typeof parsed.amount_ht === 'number' ? parsed.amount_ht : null,
    amount_ttc: typeof parsed.amount_ttc === 'number' ? parsed.amount_ttc : null,
    vat_amount: typeof parsed.vat_amount === 'number' ? parsed.vat_amount : null,
    document_type: validTypes.includes(parsed.document_type) ? parsed.document_type : null,
    category: validCategories.includes(parsed.category?.toUpperCase()) ? parsed.category.toUpperCase() : null,
    confidence_scores: {
      supplier: Number(parsed.confidence_scores?.supplier ?? 0),
      date: Number(parsed.confidence_scores?.date ?? 0),
      amount_ht: Number(parsed.confidence_scores?.amount_ht ?? 0),
      amount_ttc: Number(parsed.confidence_scores?.amount_ttc ?? 0),
      vat_amount: Number(parsed.confidence_scores?.vat_amount ?? 0),
      document_type: Number(parsed.confidence_scores?.document_type ?? 0),
      category: Number(parsed.confidence_scores?.category ?? 0),
      overall: Number(parsed.confidence_scores?.overall ?? 0),
    },
  }
}

// ─── Currency conversion ──────────────────────────────────────────────────────

async function getEurRate(fromCurrency: string): Promise<number | null> {
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${fromCurrency}`)
    if (!res.ok) return null
    const data = await res.json()
    return typeof data?.rates?.EUR === 'number' ? data.rates.EUR : null
  } catch {
    return null
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Hoist document_id so the catch block can update its status on error
  let document_id: string | undefined

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Init clients ─────────────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    // Use service role to bypass RLS for file download and document update
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Use user token to verify access
    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })

    // ── Get document_id from request ─────────────────────────────────────────
    const body = await req.json()
    document_id = body.document_id
    if (!document_id) {
      return new Response(JSON.stringify({ error: 'Missing document_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Fetch document (verify user has access) ──────────────────────────────
    const { data: doc, error: docError } = await supabaseUser
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (docError || !doc) {
      return new Response(JSON.stringify({ error: 'Document not found or access denied' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Download file from Storage (service role) ────────────────────────────
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('documents')
      .download(doc.original_file_url)

    if (downloadError || !fileData) {
      throw new Error(`Storage download failed: ${downloadError?.message}`)
    }

    // ── Convert to base64 ────────────────────────────────────────────────────
    const arrayBuffer = await fileData.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    const base64Data = btoa(
      uint8Array.reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    const mediaType = getMediaType(doc.original_filename)

    // ── Call Claude API ──────────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: anthropicKey })

    let messageContent: Anthropic.MessageParam['content']

    if (mediaType === 'application/pdf') {
      // PDF: use document content block (requires beta header)
      messageContent = [
        {
          type: 'document' as const,
          source: {
            type: 'base64' as const,
            media_type: 'application/pdf' as const,
            data: base64Data,
          },
        },
        { type: 'text' as const, text: ANALYSIS_PROMPT },
      ]
    } else {
      // Image: use image content block
      const imgMediaType = mediaType as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
      messageContent = [
        {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: imgMediaType,
            data: base64Data,
          },
        },
        { type: 'text' as const, text: ANALYSIS_PROMPT },
      ]
    }

    const requestParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: messageContent }],
    }

    // Add PDF beta header if needed
    const message = mediaType === 'application/pdf'
      ? await anthropic.beta.messages.create(
          { ...requestParams } as Parameters<typeof anthropic.beta.messages.create>[0],
          { headers: { 'anthropic-beta': 'pdfs-2024-09-25' } }
        )
      : await anthropic.messages.create(requestParams)

    // ── Parse response ───────────────────────────────────────────────────────
    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const analysisResult = parseClaudeResponse(responseText)

    // ── Currency conversion (non-EUR → EUR) ──────────────────────────────────
    let amount_ht = analysisResult.amount_ht
    let amount_ttc = analysisResult.amount_ttc
    let vat_amount = analysisResult.vat_amount
    let amount_original_currency: number | null = null

    if (analysisResult.currency !== 'EUR') {
      const rate = await getEurRate(analysisResult.currency)
      if (rate != null) {
        amount_original_currency = analysisResult.amount_ttc  // original TTC before conversion
        amount_ht = amount_ht != null ? Math.round(amount_ht * rate * 100) / 100 : null
        amount_ttc = amount_ttc != null ? Math.round(amount_ttc * rate * 100) / 100 : null
        vat_amount = vat_amount != null ? Math.round(vat_amount * rate * 100) / 100 : null
      } else {
        console.warn(`Exchange rate not available for ${analysisResult.currency}, storing amounts as-is`)
      }
    }

    // ── Fetch workspace settings (nomenclature + supplier lookup) ────────────
    const { data: wsData } = await supabaseAdmin
      .from('workspaces')
      .select('settings')
      .eq('id', doc.workspace_id)
      .single()
    const nomenclature = (wsData?.settings as Record<string, unknown> | null)?.nomenclature as NomenclatureSettings | undefined

    // ── Supplier knowledge base lookup ───────────────────────────────────────
    if (analysisResult.supplier) {
      const normalizedSupplier = normalizeSegment(analysisResult.supplier, true)
      const { data: knownSupplier } = await supabaseAdmin
        .from('supplier_categories')
        .select('category')
        .eq('workspace_id', doc.workspace_id)
        .eq('supplier_name', normalizedSupplier)
        .single()

      if (knownSupplier) {
        // Fournisseur connu → on utilise la catégorie mémorisée
        console.log(`Supplier "${normalizedSupplier}" found in knowledge base: ${knownSupplier.category}`)
        analysisResult.category = knownSupplier.category
      } else {
        // Fournisseur inconnu → recherche Wikipedia (gratuit, sans clé)
        let webCategory: string | null = null

        try {
          const query = encodeURIComponent(analysisResult.supplier)
          // Essai en français d'abord, puis en anglais
          let extract: string | null = null
          for (const lang of ['fr', 'en']) {
            const wikiRes = await fetch(
              `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&srlimit=1&format=json&origin=*`,
              { headers: { 'User-Agent': 'InGestia/1.0' } },
            )
            if (!wikiRes.ok) continue
            const wikiData = await wikiRes.json()
            const title = wikiData?.query?.search?.[0]?.snippet
            if (title) { extract = title; break }
          }

          if (extract) {
            // Mini appel Claude pour classifier depuis l'extrait Wikipedia
            const classifyMsg = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 20,
              messages: [{
                role: 'user',
                content: `Classe cette entreprise dans UNE seule catégorie parmi : REPAS, ALIMENTATION, LOGICIEL, LOYER, TELECOMMUNICATION, MATERIEL, PRESTATION, MARKETING, DEPLACEMENT, ASSURANCE, AUTRES.\n\nEntreprise : ${analysisResult.supplier}\nDescription : ${extract.replace(/<[^>]*>/g, '')}\n\nRéponds avec uniquement le nom de la catégorie, rien d'autre.`,
              }],
            })
            const classifiedCategory = classifyMsg.content[0].type === 'text'
              ? classifyMsg.content[0].text.trim().toUpperCase()
              : null

            const validCats = ['REPAS', 'ALIMENTATION', 'LOGICIEL', 'LOYER', 'TELECOMMUNICATION', 'MATERIEL', 'PRESTATION', 'MARKETING', 'DEPLACEMENT', 'ASSURANCE', 'AUTRES']
            if (classifiedCategory && validCats.includes(classifiedCategory)) {
              webCategory = classifiedCategory
            }
          }
        } catch (e) {
          console.warn('Wikipedia lookup failed:', e)
        }

        // N'utiliser Wikipedia que si ça apporte une vraie réponse (pas AUTRES)
        // Si Wikipedia dit AUTRES, on garde la catégorie que Claude a déjà trouvée
        const usefulWebCategory = (webCategory && webCategory !== 'AUTRES') ? webCategory : null
        const categoryToStore = usefulWebCategory ?? analysisResult.category ?? 'AUTRES'
        if (usefulWebCategory) analysisResult.category = usefulWebCategory

        await supabaseAdmin
          .from('supplier_categories')
          .upsert({
            workspace_id: doc.workspace_id,
            supplier_name: normalizedSupplier,
            category: categoryToStore,
            source: usefulWebCategory ? 'web_search' : 'ai',
          }, { onConflict: 'workspace_id,supplier_name', ignoreDuplicates: true })
          .then(() => console.log(`Supplier "${normalizedSupplier}" stored with category: ${categoryToStore}`))
      }
    }

    // ── Generate final filename ──────────────────────────────────────────────
    const finalFilename = generateFilename(analysisResult, nomenclature)

    // ── Update document in DB (service role) ─────────────────────────────────
    const { error: updateError } = await supabaseAdmin
      .from('documents')
      .update({
        supplier: analysisResult.supplier,
        date: analysisResult.date,
        amount_ht,
        amount_ttc,
        vat_amount,
        currency: analysisResult.currency,
        amount_original_currency,
        document_type: analysisResult.document_type,
        category: analysisResult.category,
        confidence_scores: analysisResult.confidence_scores,
        final_filename: finalFilename,
        status: 'verified',
      })
      .eq('id', document_id)

    if (updateError) {
      throw new Error(`DB update failed: ${updateError.message}`)
    }

    // ── Return result ────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ success: true, data: analysisResult, final_filename: finalFilename }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    const error = err as Error
    console.error('analyze-document error:', error.message, error.stack)

    // Try to mark the document as error in DB so the user can retry
    if (document_id) {
      try {
        const adminClient = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        await adminClient
          .from('documents')
          .update({ status: 'error' })
          .eq('id', document_id)
      } catch (_updateErr) {
        console.error('Failed to update document status to error:', _updateErr)
      }
    }

    return new Response(
      JSON.stringify({ error: error.message ?? 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
