# SecureFileSharingApp — Sujet C
**Application de partage sécurisé de fichiers**  
Cours Cloud Computing — MyDigitalSchool M2  
Stack : React 19 · TypeScript · Firebase Auth · Cloud Firestore · Firebase Storage · Cloud Functions · Firebase Hosting

**Démonstration vidéo :** [Voir sur Google Drive](https://drive.google.com/file/d/1FYPzSe9qn8VQwacBW6dbwe8TN46sPN--/view?usp=drive_link)

---

## Partie 1 — Architecture & Conception

### 1. Architecture complète

L'application suit une architecture **serverless** entièrement portée par Firebase/Google Cloud.

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│              React SPA (Vite + TypeScript)                      │
│         http://localhost:5173  /  Firebase Hosting CDN          │
└───────────┬─────────────────────────────────────────────────────┘
            │ HTTPS
┌───────────▼─────────────────────────────────────────────────────┐
│                    FIREBASE SERVICES                            │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Firebase    │  │ Cloud        │  │ Firebase Storage      │  │
│  │ Auth (JWT)  │  │ Firestore    │  │ (Google Cloud Storage)│  │
│  │             │  │ (métadonnées)│  │ (fichiers chiffrés)   │  │
│  └─────────────┘  └──────────────┘  └───────────────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Cloud Functions (Node.js 20)                 │   │
│  │  generateSignedUrl (onCall)  │  cleanExpiredFiles (cron)│   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Firebase Hosting (CDN — assets statiques)       │   │
└──┴─────────────────────────────────────────────────────────┴───┘
```

**Flux principal :**
1. L'utilisateur se connecte → Firebase Auth retourne un **JWT**
2. Le fichier est uploadé directement vers **Firebase Storage** (le JWT est vérifié par les Storage Rules)
3. Les métadonnées (nom, taille, chemin, expiration) sont écrites dans **Firestore**
4. Pour télécharger, l'utilisateur appelle la **Cloud Function** `generateSignedUrl` qui vérifie le JWT, contrôle la propriété du fichier dans Firestore, puis retourne une URL GCS signée (TTL 1h)
5. Un job planifié (`cleanExpiredFiles`) purge toutes les 24h les fichiers expirés de Firestore et Storage

### 2. Choix techniques

| Composant | Service | Justification |
|-----------|---------|---------------|
| **Frontend** | React 19 + Vite + TypeScript | Écosystème mature, HMR rapide, typage fort, bundles optimisés avec hash de contenu |
| **Authentification** | Firebase Authentication | Gestion native des JWT + refresh tokens, SDK client intégré, gratuit jusqu'à 10 000 users/mois |
| **Base de données** | Cloud Firestore | NoSQL document flexible, SDK temps réel, règles de sécurité déclaratives, offline support |
| **Stockage** | Firebase Storage (GCS) | Upload/download direct client → GCS sans serveur intermédiaire, chiffrement AES-256 au repos, TLS en transit |
| **Backend** | Cloud Functions (Node.js 20) | Serverless, scale to zero, intégration native Firebase Admin SDK, aucun serveur à gérer |
| **CDN / Hosting** | Firebase Hosting | CDN mondial Google, HTTPS automatique, headers Cache-Control personnalisés, déploiement atomique |

### 3. Scalabilité

Tous les composants scalent **automatiquement** sans configuration :

| Composant | Mécanisme |
|-----------|-----------|
| Firebase Hosting | CDN distribué mondialement — aucun serveur, aucun bottleneck |
| Firebase Storage | Infrastructure GCS — conçue pour des milliards d'objets et TB/s |
| Cloud Firestore | Auto-sharding transparent, `FieldValue.increment()` pour les compteurs |
| Cloud Functions | Scale 0 → N instances en quelques secondes (limite : 1 000 par région) |
| Firebase Auth | Géré entièrement par Google, scaling illimité |

**Points de vigilance :** cold starts Functions (~300–800ms), limite 1 write/s par document Firestore, bande passante Storage facturée au volume.

### 4. Sécurité

#### Règles Firestore
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /files/{fileId} {
      // Lecture : propriétaire uniquement
      allow read: if request.auth != null
                  && resource.data.ownerId == request.auth.uid;
      // Création : ownerId = uid appelant, champs validés, taille max 100 MB
      allow create: if request.auth != null
                    && request.resource.data.ownerId == request.auth.uid
                    && request.resource.data.size <= 104857600
                    && request.resource.data.accessCount == 0;
      // Mise à jour : ownerId immuable
      allow update: if request.auth != null
                    && resource.data.ownerId == request.auth.uid
                    && request.resource.data.ownerId == resource.data.ownerId;
      // Suppression : propriétaire uniquement
      allow delete: if request.auth != null
                    && resource.data.ownerId == request.auth.uid;
    }
  }
}
```

#### Règles Firebase Storage
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /files/{uid}/{allPaths=**} {
      // Upload vers son propre dossier, taille max 100 MB, MIME validé
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && request.resource.size <= 104857600
                   && request.resource.contentType.matches('(image|video|audio|application|text)/.*');
      // Lecture directe : propriétaire uniquement
      // Pour partager → Cloud Function generateSignedUrl (URL signée TTL 1h)
      allow read: if request.auth != null && request.auth.uid == uid;
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

#### Mécanisme d'authentification
- **Firebase Auth** émet un **ID Token JWT** (valide 1h) et un Refresh Token (stocké dans IndexedDB par le SDK)
- Chaque requête Storage/Firestore/Function inclut automatiquement ce JWT
- La Cloud Function `generateSignedUrl` vérifie 5 niveaux : authentification → validation input → existence du document → propriété (`ownerId === uid`) → expiration du fichier

#### Validation dans la Cloud Function
```typescript
// 1. Auth vérifiée automatiquement (onCall Firebase)
if (!request.auth) throw new HttpsError('unauthenticated', ...);
// 2. Input sanitization
if (!fileId || typeof fileId !== 'string') throw new HttpsError('invalid-argument', ...);
// 3. Existence Firestore
if (!fileDoc.exists) throw new HttpsError('not-found', ...);
// 4. Contrôle propriété
if (fileData.ownerId !== uid) throw new HttpsError('permission-denied', ...);
// 5. Expiration
if (expiresAt < new Date()) throw new HttpsError('failed-precondition', ...);
```

### 5. Cache & CDN

Firebase Hosting repose sur le **CDN Google** (même infrastructure que Cloud CDN, 200+ PoP mondiaux).

| Ressource | Cache-Control | Raison |
|-----------|--------------|--------|
| `/assets/index-[hash].js` | `public, max-age=31536000, immutable` | Hash Vite unique → cache 1 an sans revalidation |
| `/assets/index-[hash].css` | `public, max-age=31536000, immutable` | Idem |
| `/index.html` | `no-cache` | Point d'entrée SPA — doit toujours être à jour |
| Cloud Functions | `no-store` | Données dynamiques, jamais cachées |

Les métadonnées Firestore et les Signed URLs ne sont **jamais** mises en cache CDN (données personnelles, TTL court).

---

## Partie 2 — Implémentation

### 1. Prototype fonctionnel

#### Upload d'un fichier
```typescript
// src/services/storage.ts
export function uploadFile(file: File, onProgress: (p: number) => void) {
  const storagePath = `files/${uid}/${Date.now()}_${file.name}`;
  const uploadTask = uploadBytesResumable(ref(storage, storagePath), file);
  uploadTask.on('state_changed', snapshot => {
    onProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
  });
}
```

#### Enregistrement des métadonnées dans Firestore
```typescript
// src/services/firestore.ts
await addDoc(collection(db, 'files'), {
  name, size, contentType, storagePath, downloadURL,
  ownerId: uid,
  createdAt: serverTimestamp(),
  expiresAt: Timestamp.fromDate(expiresAt), // J+7 par défaut
  accessCount: 0,
});
```

#### Cloud Function — Génération du lien sécurisé
```typescript
// functions/src/index.ts
export const generateSignedUrl = onCall({ region: 'europe-west1' }, async (request) => {
  // Vérifications auth + propriété + expiration...
  const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
    action: 'read',
    expires: Date.now() + 60 * 60 * 1000, // TTL 1 heure
  });
  await fileDoc.ref.update({ accessCount: FieldValue.increment(1) });
  return { signedUrl, expiresIn: 3600 };
});
```

#### Nettoyage planifié des fichiers expirés
```typescript
export const cleanExpiredFiles = onSchedule({ schedule: 'every 24 hours' }, async () => {
  const expired = await db.collection('files').where('expiresAt', '<', new Date()).get();
  await Promise.all(expired.docs.map(async doc => {
    await bucket.file(doc.data().storagePath).delete();
    await doc.ref.delete();
  }));
});
```

### 2. Sécurité implémentée

Voir les règles Firestore et Storage en section 4 de la Partie 1, et les fichiers [`firestore.rules`](./firestore.rules) et [`storage.rules`](./storage.rules).

La Cloud Function applique une validation en 5 étapes avant de générer le lien (voir ci-dessus). Les liens générés ont un **TTL de 1 heure** et ne sont jamais stockés — ils sont générés à la demande.

### 3. Analyse des coûts

| Service | Tarif | Quota gratuit |
|---------|-------|--------------|
| Firestore reads | $0.06 / 100 000 | 50 000/jour |
| Firestore writes | $0.18 / 100 000 | 20 000/jour |
| Storage stockage | $0.026 / GB/mois | 5 GB |
| Storage téléchargement | $0.12 / GB | 1 GB/jour |
| Cloud Functions | $0.40 / million d'appels | 2M/mois |
| Firebase Hosting | $0.15 / GB trafic | 360 MB/jour |

**Estimation projet académique (quelques users de test) : $0/mois** — le quota gratuit couvre largement.

**Risques de dérive :**
- Liens trop consultés → beaucoup de reads Firestore + téléchargements Storage → **mitigation : cache client de la signed URL pendant son TTL (1h)**
- Writes non optimisés → utiliser `FieldValue.increment()` (atomique, 1 seul write)
- Orphelins Storage → la Function `cleanExpiredFiles` synchronise Firestore et Storage toutes les 24h

**Optimisations :**
- Pagination Firestore (`limit(20) + startAfter`)
- Mise en cache des métadonnées en `sessionStorage`
- Quotas utilisateur via les règles (taille max, nombre de fichiers)

### 4. Analyse critique

| Limite | Impact | Sévérité |
|--------|--------|----------|
| **Vendor lock-in Firebase/Google** | Migration très coûteuse (règles propriétaires, Firestore ≠ SQL) | Élevée |
| **Cold starts Cloud Functions** | 300–800ms de latence à froid sur `generateSignedUrl` | Moyenne |
| **Firestore 1 write/s par document** | Compteurs globaux nécessitent du sharding | Moyenne |
| **Pas de full-text search** | Nécessite Algolia ou Typesense en complément | Moyenne |
| **Signed URLs non supportées en émulateur** | Retour au `downloadURL` en local (comportement différent prod/dev) | Faible |

**Alternatives pour réduire le lock-in :**

| Firebase | Alternative open-source |
|----------|------------------------|
| Firestore | Supabase (PostgreSQL) |
| Firebase Auth | Auth0, Supabase Auth |
| Firebase Storage | AWS S3, Supabase Storage |
| Cloud Functions | AWS Lambda, Cloudflare Workers |

**Axe d'amélioration principal :** architecture hexagonale avec des interfaces TypeScript qui abstraient les appels Firebase — les implémentations deviennent interchangeables.

### 5. Dimension Big Data

#### Pipeline de données

```
INGESTION          STOCKAGE            TRAITEMENT           ANALYSE
─────────          ────────            ──────────           ───────
Upload fichier  →  Firebase Storage  →  Cloud Functions  →  BigQuery
Auth events     →  Cloud Firestore   →  (batch / stream)    (SQL analytics)
API calls       →  Cloud Logging     →  Pub/Sub
```

#### Batch vs Streaming

| Traitement | Type | Déclencheur |
|-----------|------|-------------|
| Nettoyage fichiers expirés | **Batch** | Cron 24h (`cleanExpiredFiles`) |
| Export Firestore → BigQuery | **Batch** | Cron nocturne (extension Firebase) |
| Mise à jour compteur d'accès | **Streaming** | Chaque appel `generateSignedUrl` |
| Détection accès suspects | **Streaming** | Trigger Storage → Pub/Sub → Cloud Function |

#### Data Lake & Data Warehouse

- **Firebase Storage = Data Lake brut** : tous les fichiers dans leur format natif, accessibles par Dataflow/BigQuery External Tables
- **BigQuery = Data Warehouse** : export Firestore + logs → requêtes SQL analytiques (fichiers populaires, comportements d'usage, tendances)

#### Architecture choisie : Lambda simplifiée

```
Batch Layer  →  Export Firestore nocturne → BigQuery (vue historique complète)
Speed Layer  →  Cloud Functions streaming  (vue temps réel : compteurs, alertes)
```

**Justification du choix Lambda plutôt que Kappa :**  
Le volume est modéré (utilisateurs individuels). Les deux besoins coexistent : temps réel pour les compteurs/alertes, historique pour les rapports. L'architecture Kappa (Dataflow pur) serait sur-dimensionnée et plus coûteuse. Firebase + BigQuery offre un Lambda serverless sans infrastructure à gérer.

---

## Lancer le projet en local

### Prérequis

- [Node.js](https://nodejs.org) v18+
- [Firebase CLI](https://firebase.google.com/docs/cli) : `npm install -g firebase-tools`
- Un projet Firebase créé sur [console.firebase.google.com](https://console.firebase.google.com) avec **Authentication (Email/Password)** activée

### 1. Cloner / récupérer le projet

```bash
git clone <url-du-repo>
cd SecureFileSharingApp
```

### 2. Installer les dépendances

```bash
# Dépendances du frontend
npm install

# Dépendances des Cloud Functions
cd functions
npm install
cd ..
```

### 3. Compiler les Cloud Functions

```bash
cd functions
npm run build
cd ..
```

> Cette étape est **obligatoire** avant de lancer l'émulateur — elle compile le TypeScript en JavaScript dans `functions/lib/`.

### 4. Se connecter à Firebase

```bash
firebase login
```

Puis renseigne ton Project ID dans [`.firebaserc`](./.firebaserc) :

```json
{
  "projects": {
    "default": "ton-project-id"
  }
}
```

### 5. Lancer les émulateurs Firebase

```bash
firebase emulators:start
```

Les émulateurs démarrent sur :

| Service | URL |
|---------|-----|
| UI des émulateurs | http://localhost:4000 |
| Auth | http://localhost:9099 |
| Firestore | http://localhost:8080 |
| Storage | http://localhost:9199 |
| Cloud Functions | http://localhost:5001 |
| Hosting | http://localhost:5000 |

> Laisse ce terminal ouvert.

### 6. Lancer le frontend React

Dans un **second terminal** :

```bash
npm run dev
```

L'application est disponible sur **http://localhost:5173**

### Résumé des commandes

```bash
# Terminal 1 — Émulateurs
firebase emulators:start

# Terminal 2 — Frontend
npm run dev
```

### Arborescence du projet

```
SecureFileSharingApp/
├── src/
│   ├── firebase.ts                  # Init Firebase + connexion émulateurs
│   ├── types/index.ts               # Types TypeScript (FileMetadata…)
│   ├── services/
│   │   ├── auth.ts                  # register / login / logout
│   │   ├── storage.ts               # Upload fichier vers GCS
│   │   └── firestore.ts             # CRUD métadonnées
│   ├── hooks/
│   │   ├── useAuth.ts               # État d'authentification (onAuthStateChanged)
│   │   └── useFiles.ts              # Gestion fichiers + appel Cloud Function
│   ├── components/
│   │   ├── Auth/AuthPage.tsx        # Formulaire login / inscription
│   │   ├── Layout/Header.tsx        # Barre de navigation
│   │   └── Dashboard/
│   │       ├── FileUploader.tsx     # Drag & drop + barre de progression
│   │       ├── FileList.tsx         # Liste des fichiers
│   │       └── FileCard.tsx         # Carte fichier + bouton lien sécurisé
│   ├── App.tsx                      # Routage auth / dashboard
│   └── index.css                    # Styles
├── functions/
│   ├── src/index.ts                 # generateSignedUrl + cleanExpiredFiles
│   ├── lib/                         # JS compilé (généré par npm run build)
│   └── package.json
├── firestore.rules                  # Règles de sécurité Firestore
├── storage.rules                    # Règles de sécurité Storage
├── firebase.json                    # Config Firebase (hosting, emulators…)
├── ARCHITECTURE.md                  # Document d'architecture détaillé
└── README.md                        # Ce fichier
```
