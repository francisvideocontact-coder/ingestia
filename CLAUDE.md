# InGest.ia

## Vision
Plateforme web + PWA de gestion documentaire comptable intelligente.
Capture (mobile/web/email) → Analyse IA → Renommage auto → Export Google Drive (Qonto Dropzone).

## Stack technique
- **Frontend** : React 18 + TypeScript + Tailwind CSS + Vite
- **Backend** : Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **IA** : API Claude (Anthropic) via Supabase Edge Function
- **Export** : Google Drive API (OAuth2)
- **Mobile** : PWA (installable, accès caméra)

## Structure du projet
```
ingestia/
├── src/
│   ├── components/       # Composants React réutilisables
│   │   ├── ui/           # Composants UI de base (shadcn/ui)
│   │   ├── auth/         # Login, Register, AuthGuard
│   │   ├── documents/    # DocumentCard, DocumentList, DocumentPreview
│   │   ├── upload/       # UploadZone, CameraCapture
│   │   ├── email/        # EmailInbox, EmailCandidateCard
│   │   ├── workspace/    # WorkspaceSettings, MemberManager
│   │   └── layout/       # Header, Sidebar, MobileNav
│   ├── hooks/            # Custom hooks (useAuth, useDocuments, useWorkspace...)
│   ├── lib/              # Utilitaires (nomenclature, validation, supabase client)
│   ├── pages/            # Pages/routes
│   ├── types/            # Types TypeScript
│   └── App.tsx
├── supabase/
│   ├── functions/        # Edge Functions (analyze-document, scan-emails)
│   ├── migrations/       # Migrations SQL
│   └── config.toml
├── public/
│   └── manifest.json     # PWA manifest
└── package.json
```

## Base de données (Supabase PostgreSQL)

### Tables principales
- `workspaces` : id, name, owner_id, settings (jsonb: nomenclature, catégories)
- `workspace_members` : user_id, workspace_id, role (owner/admin/member/viewer)
- `documents` : id, workspace_id, uploaded_by, original_file_url, original_filename, status (pending/verified/validated/exported), supplier, date, amount_ht, amount_ttc, vat_amount, document_type (facture/ndf/ticket/avoir), category, confidence_scores (jsonb), final_filename, exported_at
- `categories` : id, workspace_id, name, code, is_active
- `email_connections` : id, workspace_id, provider (gmail/imap), credentials (encrypted), filters (jsonb), scan_frequency
- `email_candidates` : id, email_connection_id, subject, sender, date, detected_type (attachment/link), attachment_url, status (pending/ingested/ignored/blocked)
- `export_logs` : id, document_id, exported_at, drive_file_id, drive_folder_path, status

### RLS (Row Level Security)
Toutes les tables utilisent RLS. Un utilisateur ne voit que les données de ses workspaces.

## Convention de nommage des fichiers
```
Pattern: {DATE}_{SUPPLIER}_{TYPE}_{CATEGORY}.pdf
Date format: YYYYMMDD
Séparateur: _
Casse: UPPER
Suffixe NDF: activable

Exemple: 20250222_AMAZON_FACTURE_MATERIEL.pdf
```

## Workflow principal
1. **Ingest** : Photo mobile / Upload web / Email détecté
2. **Stockage** : Fichier original → Supabase Storage
3. **Analyse IA** : Edge Function `analyze-document` → API Claude → extraction (fournisseur, date, montants, type, catégorie) + scores de confiance
4. **Renommage** : Génération du nom de fichier selon la nomenclature du workspace
5. **Vérification** : L'utilisateur vérifie/corrige les données extraites
6. **Validation** : La gestionnaire valide (individuel ou par lot)
7. **Export** : Fichier renommé déposé dans Google Drive `Qonto Connect Import - [ENTREPRISE]/Dropzone`

## Statuts des documents
`pending` → `verified` → `validated` → `exported`

## Edge Functions

### analyze-document
- Input : fichier (image ou PDF) depuis Supabase Storage
- Process : envoi à l'API Claude avec prompt d'extraction structurée
- Output : JSON avec fournisseur, date, montants, type, catégorie, scores de confiance

### scan-emails
- Input : credentials de la boîte mail
- Process : scan des emails récents, détection PJ comptables et liens de téléchargement
- Output : liste de candidats dans `email_candidates`

## Commandes utiles
```bash
npm run dev          # Dev local
npm run build        # Build production
npx supabase start   # Supabase local
npx supabase db push # Appliquer les migrations
npx supabase functions serve  # Edge Functions local
```

## Conventions de code
- Composants : PascalCase (DocumentCard.tsx)
- Hooks : camelCase avec préfixe `use` (useDocuments.ts)
- Types : PascalCase avec suffixe descriptif (DocumentStatus, WorkspaceSettings)
- CSS : Tailwind utility classes uniquement, pas de CSS custom
- Imports : absolus avec alias `@/` pour src/

## Phase actuelle : MVP (Phase 1)
Priorité de développement :
1. Auth + Workspace
2. Upload + Stockage
3. Analyse IA (Edge Function)
4. Dashboard + Prévisualisation
5. Nomenclature + Renommage
6. Mail monitoring
7. Export Google Drive
8. PWA (manifest, service worker, caméra)