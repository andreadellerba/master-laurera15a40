// Il "postino" delle notifiche di Laurera 15·40: lo fa girare GitHub Actions ogni 10 minuti.
// Legge calendario, commenti e complimenti da Firestore, decide chi avvisare (logica.mjs) e manda le notifiche
// ai telefoni iscritti (clubs/laurera15a40/push). Serve il secret FIREBASE_SA (chiave dell'account di servizio Firebase):
// senza, non fa niente. Le chiavi VAPID le crea da solo la prima volta e le tiene in clubs/laurera15a40/segreti
// (che l'app non può leggere); la parte pubblica la mette in clubs/laurera15a40/data/push per l'app.
import admin from 'firebase-admin';
import webpush from 'web-push';
import { calcola, TIPI } from './logica.mjs';

const SA = process.env.FIREBASE_SA;
if (!SA || !SA.trim()) { console.log('Secret FIREBASE_SA mancante: notifiche spente.'); process.exit(0); }
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(SA)) });
const db = admin.firestore();
const club = db.collection('clubs').doc('laurera15a40');
const ms = t => (t && typeof t.toMillis === 'function') ? t.toMillis() : (+t || 0);

// chiavi VAPID (create una volta sola)
const vRef = club.collection('segreti').doc('vapid');
let v = (await vRef.get()).data();
if (!v || !v.publicKey || !v.privateKey) { const k = webpush.generateVAPIDKeys(); v = { publicKey: k.publicKey, privateKey: k.privateKey }; await vRef.set(v); console.log('Chiavi VAPID create.'); }
const pubRef = club.collection('data').doc('push'), pub = (await pubRef.get()).data();
if (!pub || pub.vapid !== v.publicKey) await pubRef.set({ vapid: v.publicKey });
webpush.setVapidDetails('https://andreadellerba.github.io/master-laurera15a40/', v.publicKey, v.privateKey);

// dati del circolo
const [mainS, cmS, kdS, pushS, stS] = await Promise.all([
  club.collection('data').doc('main').get(), club.collection('commenti').get(), club.collection('complimenti').get(),
  club.collection('push').get(), club.collection('segreti').doc('notifiche').get()]);
const main = mainS.data() || {};
const commenti = cmS.docs.map(d => { const x = d.data(); return { id: d.id, mid: String(x.mid), testo: x.testo, pid: x.pid ?? null, nome: x.nome, t: ms(x.t) }; });
const complimenti = kdS.docs.map(d => { const x = d.data(); return { id: d.id, to: x.to, k: x.k, dpid: x.dpid ?? null, da: x.da, t: ms(x.t) }; });
const iscritti = pushS.docs.map(d => { const x = d.data(); let sub = null; try { sub = JSON.parse(x.sub); } catch (e) {} return { ref: d.ref, pid: x.pid, tipi: Array.isArray(x.tipi) ? x.tipi : TIPI, sub }; }).filter(s => s.sub && s.sub.endpoint);
const ora = Date.now();

// meteo (solo se c'è un promemoria da mandare: lo si scopre dopo, quindi lo si chiede sempre ma senza bloccare)
let meteo = null;
try {
  const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=44.93&longitude=7.67&hourly=temperature_2m,precipitation_probability,weathercode&forecast_days=2&timezone=Europe%2FRome', { signal: AbortSignal.timeout(8000) });
  if (r.ok) { const j = await r.json(), h = j.hourly; meteo = {}; h.time.forEach((t, i) => { meteo[t] = { t: Math.round(h.temperature_2m[i]), p: h.precipitation_probability[i] ?? 0, wc: h.weathercode[i] }; }); }
} catch (e) { console.log('Meteo non disponibile:', e.message); }

const stato = stS.exists ? stS.data() : null;
const { eventi, stato: nuovo } = calcola({ main, commenti, complimenti, stato, ora, meteo });
console.log(`${stato ? '' : 'Primo giro (si prende nota, niente notifiche). '}Eventi: ${eventi.length} · iscritti: ${iscritti.length}`);

let inviate = 0, tolte = 0;
const morti = new Set();
for (const e of eventi) {
  for (const s of iscritti.filter(s => s.pid === e.pid && s.tipi.includes(e.tipo) && !morti.has(s.ref.id))) {
    try {
      await webpush.sendNotification(s.sub, JSON.stringify({ title: e.title, body: e.body, url: e.url, tag: e.tag }),
        { TTL: e.tipo === 'prom' ? 3 * 3600 : 24 * 3600, urgency: 'high' });
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
