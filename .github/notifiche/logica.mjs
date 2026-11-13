// Logica delle notifiche di Laurera 15·40 (senza rete: si può provare da sola).
// Riceve i dati del circolo e lo stato salvato all'ultimo giro, restituisce le notifiche da mandare e il nuovo stato.

export const TIPI = ['prom', 'ris', 'cal', 'cm', 'kd'];
const ORE_PROMEMORIA = 3;          // promemoria nelle 3 ore prima della partita
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
function giornoLungo(m) {
  const d = new Date(m.data + 'T12:00:00Z');
  const s = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(/\./g, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export const iconaMeteo = (wc, notte) => wc === 0 ? (notte ? '🌙' : '☀️') : wc <= 2 ? (notte ? '☁️' : '🌤️') : wc === 3 ? '☁️' : wc <= 48 ? '🌫️' : wc <= 57 ? '🌦️' : wc <= 67 ? '🌧️' : wc <= 77 ? '❄️' : wc <= 82 ? '🌧️' : wc <= 86 ? '🌨️' : '⛈️';
const ADESIVI = { gp: '👏 GRAN PARTITA', sv: '🚀 CHE SERVIZIO', mu: '🧱 MURO', ri: '🔄 RIMONTA', cl: '🎩 CLASSE', fa: '😅 CHE FATICA' };
const taglia = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * @param {object} a
 * @param {{players:any[], sched:any[]}} a.main   documento clubs/laurera15a40/data/main
 * @param {{id:string, mid:string, testo:string, pid:number|null, nome:string, t:number}[]} a.commenti
 * @param {{id:string, to:number, k:string, dpid:number|null, da:string, t:number}[]} a.complimenti
 * @param {object|null} a.stato   stato salvato all'ultimo giro (null = primo giro: non si manda niente)
 * @param {number} a.ora          adesso (ms)
 * @param {object} [a.meteo]      previsioni orarie: { "2026-11-13T20:00": {t, p, wc} }
 */
export function calcola({ main, commenti = [], complimenti = [], stato, ora, meteo = null }) {
  const players = (main && main.players) || [], sched = ((main && main.sched) || []).filter(m => m && m.id != null);
  const P = new Map(players.map(p => [p.id, p]));
  const ev = [];
  const maxT = (L, t0) => L.reduce((a, x) => Math.max(a, +x.t || 0), t0);

  if (!stato) {   // primo giro: si prende nota di tutto senza mandare niente
    return {
      eventi: [],
      stato: {
        ris: sched.filter(m => m.risultato).map(m => m.id),
        noti: sched.map(m => m.id),
        prom: sched.filter(m => { const t = oraPartita(m); return t && t <= ora + ORE_PROMEMORIA * 3600e3; }).map(m => m.id),
        cmT: maxT(commenti, ora), kdT: maxT(complimenti, ora)
      }
    };
  }
  const ris = new Set(stato.ris || []), noti = new Set(stato.noti || []), prom = new Set(stato.prom || []);
  const a = (pid, tipo, title, body, url, tag) => { if (P.has(pid)) ev.push({ pid, tipo, title, body, url, tag }); };

  for (const m of sched) {
    const t = oraPartita(m), fra = t == null ? null : t - ora;
    // ⏰ promemoria: nelle 3 ore prima
    if (!m.risultato && fra != null && fra > 0 && fra <= ORE_PROMEMORIA * 3600e3 && !prom.has(m.id)) {
      prom.add(m.id); noti.add(m.id);
      const w = meteo && meteo[m.data + 'T' + String(m.ora || '20:00').slice(0, 2) + ':00'];
      const notte = +String(m.ora || '20').slice(0, 2) >= 18;
      for (const pid of giocatori(m))
        a(pid, 'prom', `⏰ Oggi giochi alle ${m.ora || '?'}`,
          `Contro ${avversari(m, pid, P)}${w ? ` · ${iconaMeteo(w.wc, notte)} ${w.t}°, pioggia ${w.p}%` : ''}`, `./#m=${m.id}`, `prom-${m.id}`);
    }
    // 📅 partita nuova in calendario
    if (!noti.has(m.id)) {
      noti.add(m.id);
      if (!m.risultato && fra != null && fra > 0)
        for (const pid of giocatori(m))
          a(pid, 'cal', '📅 Nuova partita in calendario', `${giornoLungo(m)}${m.ora ? ' alle ' + m.ora : ''} contro ${avversari(m, pid, P)}`, `./#m=${m.id}`, `cal-${m.id}`);
    }
    // 🎾 risultato inserito
    if (m.risultato && !ris.has(m.id)) {
      ris.add(m.id);
      if (t == null || ora - t < GIORNI_RISULTATI * 86400e3) {
        const [g1, g2] = game(m);
        for (const pid of giocatori(m)) {
          const e = esito(m, pid), s = lato(m, pid), sc = g1 == null ? String(m.risultato) : (s === 1 ? `${g1}-${g2}` : `${g2}-${g1}`);
          const title = e === 'w' ? `🏆 Hai vinto ${sc}!` : e === 'l' ? `🎾 Risultato inserito: ${sc}` : `🤝 Pareggio ${sc}`;
          a(pid, 'ris', title, `Contro ${avversari(m, pid, P)} · tocca per vedere la partita e le reazioni`, `./#m=${m.id}`, `ris-${m.id}`);
        }
      }
    }
  }
  // 💬 commenti nuovi alle proprie partite (uno per partita, con l'ultimo commento)
  const nuoviC = commenti.filter(c => +c.t > (stato.cmT || 0)).sort((x, y) => x.t - y.t), perPartita = new Map();
  for (const c of nuoviC) {
    const m = sched.find(x => String(x.id) === String(c.mid)); if (!m) continue;
    for (const pid of giocatori(m)) {
      if (c.pid != null && c.pid === pid) continue;
      const k = pid + '|' + m.id, o = perPartita.get(k) || { pid, m, n: 0, ultimo: null }; o.n++; o.ultimo = c; perPartita.set(k, o);
    }
  }
  for (const { pid, m, n, ultimo } of perPartita.values()) {
    const chi = ultimo.pid != null && P.has(ultimo.pid) ? nomeCorto(P.get(ultimo.pid).nome) : (ultimo.nome || 'Un socio');
    a(pid, 'cm', n > 1 ? `💬 ${n} nuovi commenti alla tua partita` : `💬 ${chi} ha commentato la tua partita`,
      `${n > 1 ? chi + ': ' : ''}«${taglia(ultimo.testo, 110)}»`, `./#m=${m.id}`, `cm-${m.id}`);
  }
  // 👏 complimenti ricevuti
  for (const k of complimenti.filter(x => +x.t > (stato.kdT || 0)).sort((x, y) => x.t - y.t)) {
    const chi = k.dpid != null && P.has(k.dpid) ? nomeCorto(P.get(k.dpid).nome) : (k.da || 'Un socio');
    a(k.to, 'kd', '👏 Hai ricevuto un complimento!', `${chi} ti ha mandato «${ADESIVI[k.k] || '🎁'}»`, `./#p=${k.to}`, `kd-${k.id}`);
  }
  // si tengono solo le partite che esistono ancora
  const esiste = new Set(sched.map(m => m.id)), tieni = s => [...s].filter(id => esiste.has(id));
  return {
    eventi: ev,
    stato: { ris: tieni(ris), noti: tieni(noti), prom: tieni(prom), cmT: maxT(nuoviC, stato.cmT || 0), kdT: maxT(complimenti, stato.kdT || 0) }
  };
}
