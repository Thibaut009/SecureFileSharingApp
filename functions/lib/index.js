"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanExpiredFiles = exports.generateSignedUrl = void 0;
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const storage = (0, storage_1.getStorage)();
/**
 * generateSignedUrl — Cloud Function onCall
 *
 * Sécurité (5 niveaux) :
 *  1. Authentification vérifiée automatiquement par Firebase (JWT)
 *  2. Validation de l'input (fileId string non vide)
 *  3. Existence du document Firestore
 *  4. Contrôle d'accès : ownerId === uid appelant
 *  5. Vérification de l'expiration du fichier
 *
 * Retourne une URL signée GCS valable 1 heure.
 * Prérequis : le service account Firebase doit avoir le rôle
 * "Service Account Token Creator" sur lui-même (IAM).
 */
exports.generateSignedUrl = (0, https_1.onCall)({ region: 'europe-west1' }, async (request) => {
    // 1. Vérification de l'authentification
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Authentification requise.');
    }
    // 2. Validation de l'input
    const { fileId } = request.data;
    if (!fileId || typeof fileId !== 'string' || fileId.trim() === '') {
        throw new https_1.HttpsError('invalid-argument', 'fileId est requis et doit être une chaîne non vide.');
    }
    const uid = request.auth.uid;
    // 3. Récupération du document Firestore
    const fileDoc = await db.collection('files').doc(fileId.trim()).get();
    if (!fileDoc.exists) {
        throw new https_1.HttpsError('not-found', 'Fichier introuvable.');
    }
    const fileData = fileDoc.data();
    // 4. Contrôle de propriété
    if (fileData.ownerId !== uid) {
        throw new https_1.HttpsError('permission-denied', 'Accès refusé : vous n\'êtes pas propriétaire de ce fichier.');
    }
    // 5. Vérification de l'expiration
    const expiresAt = fileData.expiresAt?.toDate?.() ?? null;
    if (expiresAt && expiresAt < new Date()) {
        throw new https_1.HttpsError('failed-precondition', 'Ce fichier a expiré et n\'est plus accessible.');
    }
    // En mode émulateur local, getSignedUrl() n'est pas supporté par l'émulateur
    // Storage → on retourne directement l'URL de téléchargement stockée dans Firestore.
    // En production (cloud réel), on génère une URL signée GCS avec TTL = 1 heure.
    const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
    let signedUrl;
    if (isEmulator) {
        signedUrl = fileData.downloadURL;
    }
    else {
        const bucket = storage.bucket();
        const file = bucket.file(fileData.storagePath);
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 60 * 60 * 1000,
        });
        signedUrl = url;
    }
    // Mise à jour du compteur d'accès (atomique via FieldValue.increment)
    await fileDoc.ref.update({
        accessCount: firestore_1.FieldValue.increment(1),
        lastAccessedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { signedUrl, expiresIn: 3600 };
});
/**
 * cleanExpiredFiles — Cloud Function Scheduled (cron toutes les 24h)
 *
 * Supprime les fichiers expirés de Firestore ET de Firebase Storage
 * pour éviter les orphelins et les frais de stockage inutiles.
 *
 * Pipeline Big Data (Batch Layer) :
 *   Firestore query (expiresAt < now) → delete GCS object → delete Firestore doc
 */
exports.cleanExpiredFiles = (0, scheduler_1.onSchedule)({ schedule: 'every 24 hours', region: 'europe-west1' }, async () => {
    const now = new Date();
    const expiredSnapshot = await db
        .collection('files')
        .where('expiresAt', '<', now)
        .get();
    if (expiredSnapshot.empty) {
        console.log('Aucun fichier expiré à nettoyer.');
        return;
    }
    const bucket = storage.bucket();
    // Traitement en parallèle par lots de 10 pour éviter les timeouts
    const BATCH_SIZE = 10;
    const docs = expiredSnapshot.docs;
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = docs.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (doc) => {
            const data = doc.data();
            try {
                await bucket.file(data.storagePath).delete();
            }
            catch (err) {
                // Le fichier GCS peut déjà avoir été supprimé manuellement
                console.warn(`GCS delete skipped for ${data.storagePath}:`, err);
            }
            await doc.ref.delete();
        }));
    }
    console.log(`Nettoyage terminé : ${docs.length} fichier(s) expiré(s) supprimé(s).`);
});
/**
 * onFileUploaded — Storage trigger (post-traitement)
 *
 * Déclenché à chaque upload. Peut être utilisé pour :
 * - Enrichir les métadonnées (taille réelle, hash)
 * - Lancer un scan antivirus (Cloud DLP / ClamAV)
 * - Publier un événement sur Pub/Sub (pipeline Big Data streaming)
 *
 * Note : importé conditionnellement pour éviter un import circular
 */
// import { onObjectFinalized } from 'firebase-functions/v2/storage';
// export const onFileUploaded = onObjectFinalized(
//   { region: 'europe-west1' },
//   async (event) => {
//     const { name: storagePath, size, contentType } = event.data;
//     console.log(`Nouveau fichier uploadé : ${storagePath} (${size} bytes, ${contentType})`);
//     // Publier sur Pub/Sub pour le pipeline de streaming BigQuery
//   }
// );
//# sourceMappingURL=index.js.map