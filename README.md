# Circolo Tennis Laurera 15A40

Sito web del Centro Sportivo Laurera 15A40.

## Struttura

- `index.html` — pagina principale del sito (pubblicata su https://andreadellerba.github.io/master-laurera15a40/)

## Dati e backend

Il sito usa Firebase (Firestore + Authentication) per salvare giocatori, tornei, calendario, albo d'oro e pronostici Fantatennis. La configurazione Firebase (`apiKey` ecc.) nel file HTML è pubblica per natura — è normale per un'app client-side Firebase e non va trattata come un segreto da nascondere.

La vera protezione dei dati sta nelle **Firestore Security Rules** e in **Firebase Authentication**, entrambe configurate nella console Firebase del progetto (non in questo repository). Prima di ogni modifica che tocca login admin o permessi di scrittura, verificare che le regole richiedano autenticazione per tutte le scritture.

## Sicurezza

- Non committare mai file `.env`, chiavi private, `serviceAccountKey.json` o altre credenziali: sono già esclusi da `.gitignore`, ma controllare sempre `git status`/`git diff` prima di un commit.
- L'output di campi testo liberi (nomi giocatori, titoli partite, note, pronostici, ecc.) viene sanificato tramite la funzione `esc()` prima di essere inserito in pagina, per prevenire XSS. Qualsiasi nuovo punto che mostra testo proveniente da form o dati salvati deve usare `esc()` (o `textContent`), mai concatenazione diretta in `innerHTML`.
