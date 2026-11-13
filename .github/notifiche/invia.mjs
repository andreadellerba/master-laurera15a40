// Il "postino" delle notifiche di Laurera 15·40: lo fa girare GitHub Actions ogni 10 minuti.
// Legge il calendario da Firestore, trova i risultati appena inseriti (logica.mjs) e avvisa i giocatori di quelle
// partite sui telefoni iscritti (clubs/laurera15a40/push). Serve il secret FIREBASE_SA (chiave dell'account di servizio
// Firebase): senza, non fa niente. Le chiavi VAPID le crea da solo la prima volta e le tiene in clubs/laurera15a40/segreti
// (che l'app non può leggere); la parte pubblica la mette in clubs/laurera15a40/data/push per l'app.
import admin from 'firebase-admin';
import webpush from 'web-push';
import { calcola, TIPI } from './logica.mjs';

const SA = process.env.FIREBASE_SA;
if (!SA || !SA.trim()) { console.log('Secret FIREBASE_SA mancante: notifiche spente.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const club = db.collection('clubs').doc('laurera15a40');

// chiavi VAPID (create una volta sola)
const vRef = club.collection('segreti').doc('vapid');
let v = (await vRef.get()).data();
if (!v || !v.publicKey || !v.privateKey) { const k = webpush.generateVAPIDKeys(); v = { publicKey: k.publicKey, privateKey: k.privateKey }; await vRef.set(v); console.log('Chiavi VAPID create.'); }
const pubRef = club.collection('data').doc('push'), pub = (await pubRef.get()).data();
if (!pub || pub.vapid !== v.publicKey) await pubRef.set({ vapid: v.publicKey });
webpush.setVapidDetails('https://andreadellerba.github.io/master-laurera15a40/', v.publicKey, v.privateKey);

// dati del circolo, iscritti e stato dell'ultimo giro
const [mainS, pushS, stS] = await Promise.all([
  club.collection('data').doc('main').get(), club.collection('push').get(), club.collection('segreti').doc('notifiche').get()]);
const iscritti = pushS.docs.map(d => { const x = d.data(); let sub = null; try { sub = JSON.parse(x.sub); } catch (e) {} return { ref: d.ref, pid: x.pid, tipi: Array.isArray(x.tipi) ? x.tipi : TIPI, sub }; }).filter(s => s.sub && s.sub.endpoint);
const stato = stS.exists ? stS.data() : null;
const { eventi, stato: nuovo } = calcola({ main: mainS.data() || {}, stato, ora: Date.now() });
console.log(`${stato ? '' : 'Primo giro (si prende nota, niente notifiche). '}Risultati da avvisare: ${eventi.length} · telefoni iscritti: ${iscritti.length}`);

let inviate = 0, tolte = 0;
const morti = new Set();
for (const e of eventi) {
  for (const s of iscritti.filter(s => s.pid === e.pid && s.tipi.includes(e.tipo) && !morti.has(s.ref.id))) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify({ title: e.title, body: e.body, url: e.url, tag: e.tag }), { TTL: 24 * 3600, urgency: 'high' });
      inviate++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { morti.add(s.ref.id); await s.ref.delete().catch(() => {}); tolte++; }
      else console.log('Invio non riuscito', err.statusCode || '', (err.body || err.message || '').toString().slice(0, 200));
    }
  }
}
await club.collection('segreti').doc('notifiche').set(nuovo);
console.log(`Notifiche inviate: ${inviate}${tolte ? ` · iscrizioni scadute tolte: ${tolte}` : ''}`);
process.exit(0);
