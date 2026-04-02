import type { Document, WorkspaceSettings } from '@/types'

/**
 * Génère le nom de fichier final selon la convention InGest.ia
 * Pattern par défaut : {DATE}_{SUPPLIER}_{TYPE}_{CATEGORY}.pdf
 * Avec ndf_prefix activé pour NDF : {DATE}_NDF_{SUPPLIER}_{CATEGORY}.pdf
 */
export function generateFilename(
  doc: Partial<Document>,
  settings?: WorkspaceSettings['nomenclature']
): string {
  const separator = settings?.separator ?? '_'
  const useUpperCase = settings?.case !== 'LOWER'
  const ndfPrefix = settings?.ndf_prefix ?? false
  const isNdf = doc.document_type === 'ndf'

  const parts: string[] = []

  // DATE : YYYYMMDD
  parts.push(doc.date ? doc.date.replace(/-/g, '') : 'XXXXXXXX')

  // NDF prefix — se place juste après la date, remplace le segment TYPE
  if (ndfPrefix && isNdf) {
    parts.push(useUpperCase ? 'NDF' : 'ndf')
  }

  // SUPPLIER
  if (doc.supplier) {
    parts.push(normalizeSegment(doc.supplier, useUpperCase))
  } else {
    parts.push(useUpperCase ? 'FOURNISSEUR' : 'fournisseur')
  }

  // TYPE — uniquement si pas déjà indiqué par le préfixe NDF
  if (!(ndfPrefix && isNdf)) {
    if (doc.document_type) {
      parts.push(useUpperCase ? doc.document_type.toUpperCase() : doc.document_type.toLowerCase())
    } else {
      parts.push(useUpperCase ? 'DOCUMENT' : 'document')
    }
  }

  // CATEGORY
  if (doc.category) {
    parts.push(normalizeSegment(doc.category, useUpperCase))
  } else {
    parts.push(useUpperCase ? 'CATEGORIE' : 'categorie')
  }

  return parts.join(separator) + '.pdf'
}

/**
 * Normalise un segment de nom de fichier :
 * - Supprime les accents
 * - Remplace les espaces et caractères spéciaux par des underscores
 * - Passe en majuscules si demandé
 */
export function normalizeSegment(value: string, uppercase: boolean): string {
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
