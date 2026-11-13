// Logica delle notifiche di Laurera 15·40 (senza rete: si può provare da sola).
// Si avvisa SOLO quando viene inserito il risultato di una partita: ricevono la notifica i giocatori di quella partita.
// Riceve i dati del circolo e lo stato salvato all'ultimo giro, restituisce le notifiche da mandare e il nuovo stato.

export const TIPI = ['ris'];
const GIORNI_RISULTATI = 7;        // risultati di partite più vecchie di così: niente notifica

export function nomeCorto(nome) {   // "Mario Rossi" → "M. ROSSI" (come nell'app)
  if (!nome) return '?';
  return String(nome).split(' / ').map(n => {
    const p = n.trim().split(/\s+/);
    if (p.length < 2) return n.toUpperCase();
    return (p[0].charAt(0) + '. ' + p.slice(1).join(' ')).toUpperCase();
  }).join(' / ');
}

// differenza tra ora di Roma e UTC (ms) in un certo istante
function scartoRoma(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}
export function oraPartita(m) {     // istante (ms) di inizio partita, ora di Roma
  if (!m || !m.data || !/^\d{4}-\d{2}-\d{2}$/.test(m.data)) return null;
  const [y, mo, d] = m.data.split('-').map(Number);
  const [h, mi] = String(m.ora || '20:00').split(':').map(Number);
  const g = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  return g - scartoRoma(g);
}
const giocatori = m => [m.p1Id, m.p1Id2, m.p2Id, m.p2Id2].filter(x => x != null);
const lato = (m, pid) => (m.p1Id === pid || m.p1Id2 === pid) ? 1 : (m.p2Id === pid || m.p2Id2 === pid) ? 2 : 0;
function game(m) {
  let a = +m.gv1, b = +m.gv2;
  if (!(Number.isFinite(a) && Number.isFinite(b) && (a || b))) {
    const r = String(m.risultato || '').match(/(\d+)\s*[-–]\s*(\d+)/);
    if (r) { a = +r[1]; b = +r[2]; } else { a = b = null; }
  }
  return [a, b];
}
function esito(m, pid) {
  const s = lato(m, pid); if (!s) return null;
  if (!m.winnerId || m.winnerId === 'draw') return 'd';
  const w = (+m.winnerId === m.p1Id || +m.winnerId === m.p1Id2) ? 1 : 2;
  return w === s ? 'w' : 'l';
}
function avversari(m, pid, P) {
  const s = lato(m, pid);
  const ids = s === 1 ? [m.p2Id, m.p2Id2] : [m.p1Id, m.p1Id2];
  const n = ids.filter(x => x != null).map(id => P.get(id)).filter(Boolean).map(p => nomeCorto(p.nome));
  return n.length ? n.join(' / ') : nomeCorto(s === 1 ? m.teamName2 : m.teamName1);
}

/**
 * @param {object} a
 * @param {{players:any[], sched:any[]}} a.main   documento clubs/laurera15a40/data/main
 * @param {object|null} a.stato   stato salvato all'ultimo giro (null = primo giro: non si manda niente)
 * @param {number} a.ora          adesso (ms)
 */
export function calcola({ main, stato, ora }) {
  const players = (main && main.players) || [], sched = ((main && main.sched) || []).filter(m => m && m.id != null);
  const P = new Map(players.map(p => [p.id, p]));
  // primo giro: si prende nota dei risultati già inseriti senza mandare niente
  if (!stato || !Array.isArray(stato.ris)) return { eventi: [], stato: { ris: sched.filter(m => m.risultato).map(m => m.id) } };

  const ris = new Set(stato.ris), ev = [];
  for (const m of sched) {
    if (!m.risultato || ris.has(m.id)) continue;
    ris.add(m.id);
    const t = oraPartita(m);
    if (t != null && ora - t >= GIORNI_RISULTATI * 86400e3) continue;
    const [g1, g2] = game(m);
    for (const pid of giocatori(m)) {
      if (!P.has(pid)) continue;
      const e = esito(m, pid), s = lato(m, pid), sc = g1 == null ? String(m.risultato) : (s === 1 ? `${g1}-${g2}` : `${g2}-${g1}`);
      const title = e === 'w' ? `🏆 Hai vinto ${sc}!` : e === 'l' ? `🎾 Risultato inserito: ${sc}` : `🤝 Pareggio ${sc}`;
      ev.push({ pid, tipo: 'ris', title, body: `Contro ${avversari(m, pid, P)} · tocca per vedere la partita`, url: `./#m=${m.id}`, tag: `ris-${m.id}` });
    }
  }
  // si tengono solo le partite che esistono ancora (un risultato cancellato e reinserito riavvisa)
  const conRis = new Set(sched.filter(m => m.risultato).map(m => m.id));
  return { eventi: ev, stato: { ris: [...ris].filter(id => conRis.has(id)) } };
}
