// ─── Workspace ────────────────────────────────────────────────────────────────

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface WorkspaceSettings {
  nomenclature?: {
    date_format?: string
    separator?: string
    case?: 'UPPER' | 'LOWER'
    ndf_suffix?: boolean
  }
  categories?: string[]
  drive_folder_id?: string
  drive_folder_path?: string
}

export interface Workspace {
  id: string
  name: string
  owner_id: string
  settings: WorkspaceSettings
  created_at: string
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  created_at: string
  // Joined fields
  user?: {
    email: string
    full_name?: string
  }
}

// ─── Category ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string
  workspace_id: string
  name: string
  code: string
  is_active: boolean
  created_at: string
}

// ─── Document ─────────────────────────────────────────────────────────────────

export type DocumentStatus = 'pending' | 'verified' | 'validated' | 'exported' | 'error'
export type DocumentType = 'facture' | 'ndf' | 'ticket' | 'avoir'

export interface ConfidenceScores {
  supplier?: number
  date?: number
  amount_ht?: number
  amount_ttc?: number
  vat_amount?: number
  document_type?: number
  category?: number
  overall?: number
}

export interface Document {
  id: string
  workspace_id: string
  uploaded_by: string
  original_file_url: string
  original_filename: string
  status: DocumentStatus
  supplier?: string
  date?: string
  amount_ht?: number
  amount_ttc?: number
  vat_amount?: number
  document_type?: DocumentType
  category?: string
  confidence_scores?: ConfidenceScores
  final_filename?: string
  exported_at?: string
  created_at: string
  currency?: string
  amount_original_currency?: number
}

// ─── Email ────────────────────────────────────────────────────────────────────

export type EmailProvider = 'gmail' | 'imap'
export type EmailCandidateDetectedType = 'attachment' | 'link'
export type EmailCandidateStatus = 'pending' | 'ingested' | 'ignored' | 'blocked'

export interface EmailConnectionFilters {
  from?: string[]
  subject_keywords?: string[]
  has_attachment?: boolean
}

export interface EmailConnection {
  id: string
  workspace_id: string
  provider: EmailProvider
  credentials: Record<string, unknown>
  filters: EmailConnectionFilters
  scan_frequency: string
  created_at: string
}

export interface EmailCandidate {
  id: string
  email_connection_id: string
  subject: string
  sender: string
  date: string
  detected_type: EmailCandidateDetectedType
  attachment_url?: string
  status: EmailCandidateStatus
  created_at: string
}

// ─── Export ───────────────────────────────────────────────────────────────────

export interface ExportLog {
  id: string
  document_id: string
  exported_at: string
  drive_file_id: string
  drive_folder_path: string
  status: string
  created_at: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  email: string
}

// ─── Invitation ───────────────────────────────────────────────────────────────

export interface PendingInvitation {
  email: string
  role: Exclude<WorkspaceRole, 'owner'>
}
