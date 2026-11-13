// Il "postino" delle notifiche di Laurera 15·40: lo fa girare GitHub Actions ogni 10 minuti.
// Legge il calendario da Firestore, trova i risultati appena inseriti (logica.mjs) e li manda a tutti i telefoni
// iscritti (clubs/laurera15a40/push); chi ha giocato la partita riceve la versione personale («Hai vinto 6-3!»). Serve il secret FIREBASE_SA (chiave dell'account di servizio
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
if (v.creata !== true) { await club.collection('data').doc('push').set({ vapid: v.publicKey }); await vRef.set({ ...v, creata: true }); }   // la chiave pubblica per l'app, una volta sola
webpush.setVapidDetails('https://andreadellerba.github.io/master-laurera15a40/', v.publicKey, v.privateKey);

// dati del circolo e stato dell'ultimo giro (pochissime letture: gira 144 volte al giorno, i limiti gratuiti sono 50.000)
const stRef = club.collection('segreti').doc('notifiche');
const [mainS, stS] = await Promise.all([club.collection('data').doc('main').get(), stRef.get()]);
const stato = stS.exists ? stS.data() : null;
const { eventi, stato: nuovo } = calcola({ main: mainS.data() || {}, stato, ora: Date.now() });
if (JSON.stringify(nuovo) !== JSON.stringify(stato)) await stRef.set(nuovo);
if (!eventi.length) { console.log(`${stato ? '' : 'Primo giro (si prende nota, niente notifiche). '}Nessun risultato nuovo.`); process.exit(0); }
// i telefoni iscritti si leggono solo quando c'è qualcosa da mandare
const pushS = await club.collection('push').get();
const iscritti = pushS.docs.map(d => { const x = d.data(); let sub = null; try { sub = JSON.parse(x.sub); } catch (e) {} return { ref: d.ref, pid: x.pid, tipi: Array.isArray(x.tipi) ? x.tipi : TIPI, sub }; }).filter(s => s.sub && s.sub.endpoint);
console.log(`Risultati da avvisare: ${eventi.length} · telefoni iscritti: ${iscritti.length}`);

// ogni iscritto riceve tutti i risultati nuovi: quelli delle sue partite in versione personale,
// gli altri uno per uno (se sono più di 3 nello stesso giro, un solo riepilogo)
let inviate = 0, tolte = 0;
for (const s of iscritti.filter(s => s.tipi.includes('ris'))) {
  const mie = eventi.filter(e => e.mie[s.pid]).map(e => ({ ...e.mie[s.pid], url: e.url, tag: e.tag }));
  const altre = eventi.filter(e => !e.mie[s.pid]);
  const msg = [...mie, ...(altre.length > 3
    ? [{ title: `🎾 ${altre.length} nuovi risultati`, body: altre.slice(0, 3).map(e => e.riga).join(' · ') + ' …', url: './#ris', tag: 'ris-tanti' }]
    : altre.map(e => ({ ...e.tutti, url: e.url, tag: e.tag })))];
  for (const n of msg) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify(n), { TTL: 24 * 3600, urgency: 'normal' });
      inviate++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) { await s.ref.delete().catch(() => {}); tolte++; break; }
      console.log('Invio non riuscito', err.statusCode || '', (err.body || err.message || '').toString().slice(0, 200));
    }
  }
}
console.log(`Notifiche inviate: ${inviate}${tolte ? ` · iscrizioni scadute tolte: ${tolte}` : ''}`);
process.exit(0);
