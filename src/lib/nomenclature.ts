import type { Document, WorkspaceSettings } from '@/types'

/**
 * Génère le nom de fichier final selon la convention InGest.ia
 * Pattern: {DATE}_{SUPPLIER}_{TYPE}_{CATEGORY}.pdf
 * Exemple: 20250222_AMAZON_FACTURE_MATERIEL.pdf
 */
export function generateFilename(
  doc: Partial<Document>,
  settings?: WorkspaceSettings['nomenclature']
): string {
  const separator = settings?.separator ?? '_'
  const useUpperCase = settings?.case !== 'LOWER'

  const parts: string[] = []

  // DATE : YYYYMMDD
  if (doc.date) {
    const dateStr = doc.date.replace(/-/g, '')
    parts.push(dateStr)
  } else {
    parts.push('XXXXXXXX')
  }

  // SUPPLIER : nettoyé et normalisé
  if (doc.supplier) {
    const supplier = normalizeSegment(doc.supplier, useUpperCase)
    parts.push(supplier)
  } else {
    parts.push('FOURNISSEUR')
  }

  // TYPE : document type
  if (doc.document_type) {
    const type = useUpperCase ? doc.document_type.toUpperCase() : doc.document_type.toLowerCase()
    // Suffixe NDF si activé
    const finalType =
      doc.document_type === 'ndf' && settings?.ndf_suffix
        ? `${type}_NDF`
        : type
    parts.push(finalType)
  } else {
    parts.push('DOCUMENT')
  }

  // CATEGORY
  if (doc.category) {
    const category = normalizeSegment(doc.category, useUpperCase)
    parts.push(category)
  } else {
    parts.push('CATEGORIE')
  }

  return parts.join(separator) + '.pdf'
}

/**
 * Normalise un segment de nom de fichier :
 * - Supprime les accents
 * - Remplace les espaces et caractères spéciaux par des underscores
 * - Passe en majuscules si demandé
 */
function normalizeSegment(value: string, uppercase: boolean): string {
  let normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^a-zA-Z0-9]/g, '_')   // Remplacer les caractères spéciaux
    .replace(/_+/g, '_')              // Collaper les underscores multiples
    .replace(/^_|_$/g, '')            // Supprimer les underscores en début/fin

  return uppercase ? normalized.toUpperCase() : normalized.toLowerCase()
}

/**
 * Formate une date en YYYYMMDD pour la nomenclature
 */
export function formatDateForNomenclature(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

/**
 * Prévisualise le nom de fichier en temps réel
 */
export function previewFilename(
  supplier?: string,
  date?: string,
  documentType?: string,
  category?: string
): string {
  return generateFilename({
    supplier,
    date,
    document_type: documentType as Document['document_type'],
    category,
  })
}
