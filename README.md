# 🏅 Olimpiadi Epiche Estive — I Edizione

PWA installabile per gestire l'evento: nazioni (le città di residenza dei partecipanti), atleti,
discipline con descrizione e regolamento, risultati e classifiche che si aggiornano per tutti.

**Architettura:** app statica su GitHub Pages + Google Sheet come database (via Google Apps Script).
Costo zero, nessun server, nessun build step.

```
Visitatori  ──GET──►  Apps Script /exec  ──►  Google Sheet
Admin (PIN) ──POST─►        ▲
GitHub Pages ── serve l'app statica ────────┘
```

---

## 1. Backend: Google Sheet + Apps Script

1. Crea un **Google Sheet** vuoto (nome libero, es. `Olimpiadi Epiche Estive`).
2. `Estensioni ▸ Apps Script`. Cancella il contenuto di `Codice.gs` e incolla tutto
   il file [`apps-script/Code.gs`](apps-script/Code.gs). Salva.
3. Nella barra funzioni seleziona **`setup`** e premi **Esegui**. Autorizza quando richiesto
   (schermata "App non verificata" ▸ *Avanzate* ▸ *Vai a … (non sicuro)*: è il tuo script).
   Vengono creati i fogli `NAZIONI`, `ATLETI`, `SQUADRE`, `SPORT`, `INCONTRI`, `RISULTATI`,
   `CONFIG` e il PIN admin `123456`.
4. **Cambia il PIN**: `⚙ Impostazioni progetto ▸ Proprietà script ▸ Aggiungi proprietà`
   → nome `ADMIN_PIN`, valore il tuo PIN.
5. `Distribuisci ▸ Nuova distribuzione ▸ Tipo: App web`
   - *Descrizione*: v1
   - *Esegui come*: *Me*
   - *Chi ha accesso*: **Chiunque**
   
   Copia l'**URL che finisce con `/exec`**.

> Opzionale: esegui `seedDemo` per popolare tre nazioni (una per zona), atleti, due squadre miste,
> tre discipline con formati diversi e qualche incontro in calendario.

> 🔄 **Se aggiorni `Code.gs` su un foglio già in uso, riesegui `setup`.** È idempotente: crea i fogli
> mancanti e allinea le intestazioni alle nuove colonne (`zona`, `formato`, `squadraId`) senza
> toccare i dati esistenti.

> ⚠️ Dopo ogni modifica al codice: `Distribuisci ▸ Gestisci distribuzioni ▸ ✏️ ▸ Versione: Nuova`.
> Senza questo passaggio l'URL `/exec` continua a servire il codice vecchio.

## 2. Frontend: GitHub Pages

1. Crea un repository (es. `olimpiadi-epiche-estive`) e carica il contenuto di questa cartella
   nella root del branch `main`.
2. `Settings ▸ Pages`: *Source* = **Deploy from a branch**, branch `main`, folder `/ (root)`. Salva.
3. Dopo circa un minuto l'app è online su
   `https://<tuo-utente>.github.io/olimpiadi-epiche-estive/`.

Da riga di comando:

```bash
cd olimpiadi-epiche-estive
git init
git add .
git commit -m "feat: prima versione Olimpiadi Epiche Estive"
git branch -M main
git remote add origin https://github.com/<tuo-utente>/olimpiadi-epiche-estive.git
git push -u origin main
```

## 3. Collegare app e dati

L'URL è già scritto in `API_URL` dentro [`js/config.js`](js/config.js): vale per **tutti** i
visitatori, che non devono configurare niente. Per puntare a un altro foglio, cambia quella riga.

In alternativa, dall'app: **Admin ▸ Impostazioni ▸ Cambia URL API**. Attenzione, quell'override
vale **solo nel browser in cui lo fai** (è salvato in `localStorage`) e nasconde il valore di
`config.js`: la stessa scheda mostra quale dei due è in uso e il pulsante *Usa il predefinito* per
tornare indietro.

Poi: Admin ▸ PIN ▸ inserisci nazioni, atleti, sport, risultati.

## 4. Installare come app

Sul telefono apri il link e usa *Aggiungi a schermata Home* (Android: banner automatico,
iOS: Condividi ▸ Aggiungi a Home). L'app funziona anche offline mostrando gli ultimi dati scaricati.

---

## Come funziona l'aggiornamento "per tutti"

- L'admin scrive → il dato finisce nel Google Sheet.
- Ogni client rilegge i dati **ogni 30 secondi**, al ritorno sull'app e al tocco su **⟳**.
- L'ultima risposta valida resta in `localStorage`: se salta la rete, l'app mostra i dati salvati
  con un avviso.

## Modello dati

| Entità | Cos'è | Note |
|---|---|---|
| **Nazione** | la città di residenza dei partecipanti | ha una **zona**: Nord, Centro, Sud |
| **Atleta** | un partecipante | appartiene a una sola nazione |
| **Squadra** | formazione **mista** | pesca atleti da nazioni e zone diverse, non segue le zone |
| **Sport** | la disciplina | descrizione, regolamento, formato di calendario |
| **Incontro** | una voce di calendario | per singola disciplina: fase, turno, data, luogo, i due lati e il punteggio |
| **Risultato** | un piazzamento finale | assegna i punti a una nazione **o** a una squadra |

Zone e squadre sono due assi indipendenti, per scelta: le zone servono ad aggregare le nazioni in
classifica, le squadre sono composizioni libere che tagliano trasversalmente le nazioni.

## Calendario, per singola disciplina

Ogni disciplina ha il suo formato, che decide come viene mostrato il calendario nella sua scheda:

| Formato | Rendering | Quando usarlo |
|---|---|---|
| **Classifica aperta** | solo elenco risultati | tutti gareggiano insieme, conta l'ordine d'arrivo |
| **Scontri diretti** | elenco di sfide | sfide uno contro uno senza struttura |
| **Tabellone a eliminazione** | turni affiancati, scorrevoli | chi vince avanza |
| **Girone all'italiana** | elenco incontri + classifica del girone | tutti contro tutti |

Gli incontri si gestiscono da **Admin ▸ Calendario**, scegliendo la disciplina dal menu in alto.
Ogni lato di un incontro può essere una squadra, una nazione o un atleta (riferimenti `sqd:`,
`naz:`, `atl:` nel foglio), e si può lasciare vuoto finché l'avversario non è noto. Nei gironi la
classifica si calcola dai soli incontri conclusi, con i punti per vittoria e pareggio impostabili in
Admin ▸ Impostazioni; a parità conta la differenza punti.

## Punteggi

- Schema globale in `CONFIG ▸ punti` (default `10,7,5,3,2,1`): punti per 1°, 2°, 3°…
- Ogni disciplina può avere il suo schema nel campo **Punti personalizzati** (es. finale con
  punteggio doppio: `20,14,10,6,4,2`).
- Le medaglie derivano dalla posizione: 1 = oro, 2 = argento, 3 = bronzo.
- Parità in classifica: vince chi ha più ori, poi argenti, poi bronzi.

## Chi prende i punti

Ogni risultato assegna i punti a una nazione **oppure** a una squadra mista, e può elencare gli
atleti coinvolti:

| Caso | Punti a | Atleti da indicare |
|---|---|---|
| Gara individuale | nazione dell'atleta | l'atleta |
| Gara fra nazioni | la nazione | opzionale |
| Gara fra squadre miste | la squadra | opzionale: se vuoto valgono tutti i componenti |

Ci sono quattro classifiche: **nazioni**, **zone** (somma delle nazioni di Nord, Centro e Sud),
**squadre** e **atleti**. Le squadre sono miste, quindi i loro punti non entrano nel medagliere
delle nazioni: finirebbero per premiare città a caso. Gli atleti invece accumulano tutto, punti presi
con la nazione e punti presi con la squadra.

Se preferisci che le gare a squadre distribuiscano punti anche alle nazioni dei componenti (per
esempio pro quota), è una modifica contenuta in `classifica()` dentro `js/store.js`: dimmelo e la
faccio.

## Struttura del progetto

```
index.html                 shell dell'app
manifest.webmanifest       metadati PWA
sw.js                      service worker (offline + cache)
css/style.css              stile
js/config.js               URL API, nome evento, punti di default
js/api.js                  chiamate ad Apps Script + PIN admin
js/store.js                stato, cache offline, classifiche calcolate
js/ui.js                   modali e form generici
js/utils.js                helper (escape, date, toast)
js/views/public.js         home, sport, calendario, nazioni, squadre, atleti, classifiche
js/views/admin.js          pannello admin (CRUD + calendario)
apps-script/Code.gs        backend da incollare in Apps Script
tools/make-icons.ps1       rigenera le icone PNG
icons/                     icone PWA
```

## Risoluzione problemi

In **Admin** c'è il pulsante **Testa connessione** (disponibile anche nella schermata del PIN, così
resta raggiungibile se il collegamento è rotto): dice esattamente cosa non torna.

| Sintomo | Causa | Rimedio |
|---|---|---|
| `404: nessuna distribuzione a quell'indirizzo` | URL non è quello della distribuzione, o la distribuzione non esiste / è stata archiviata | `Distribuisci ▸ Gestisci distribuzioni`, copia l'URL che finisce con `/exec`. Se la lista è vuota: `Nuova distribuzione ▸ App web` |
| Hai copiato `…/home/projects/…/edit` | è l'URL dell'editor Apps Script | serve l'URL della distribuzione, `https://script.google.com/macros/s/<ID>/exec` |
| Hai copiato l'URL del foglio (`docs.google.com/spreadsheets/…`) | è il database, non l'API | come sopra |
| URL che finisce con `/dev` | funziona solo nel tuo browser autenticato | usa `/exec` |
| Risposta HTML invece dei dati | distribuzione non pubblica | nella distribuzione: *Chi ha accesso* = **Chiunque** |
| `Foglio "NAZIONI" mancante` | `setup` non eseguito | esegui la funzione `setup` nell'editor |
| Le modifiche al codice non hanno effetto | l'URL serve la versione vecchia | `Gestisci distribuzioni ▸ ✏️ ▸ Versione: Nuova` |
| `PIN admin non valido` | PIN diverso da `ADMIN_PIN` | `Impostazioni progetto ▸ Proprietà script` |

Verifica veloce da PowerShell, senza browser:

```powershell
$u = 'https://script.google.com/macros/s/<ID>/exec'
(Invoke-WebRequest "$u`?action=state" -UseBasicParsing).Content
```

Una risposta che inizia con `{"ok":true` è quella giusta.

## Sicurezza, in chiaro

Il PIN è verificato **lato server** e non è contenuto nell'app, ma il modello resta quello di un
segreto condiviso su un endpoint pubblico: chiunque abbia l'URL `/exec` può **leggere** tutto, e
chiunque conosca il PIN può **scrivere**. Va benissimo per un evento tra amici. Non ci metteresti
dati sensibili: usa nomi e città, niente indirizzi, telefoni o altro.
Se il PIN gira troppo, cambialo in `Proprietà script` (l'app chiederà di reinserirlo).

## Sviluppo in locale

I moduli ES richiedono un server HTTP, `file://` non basta:

```bash
py -m http.server 8080
# poi apri http://localhost:8080
```

Rigenerare le icone dopo aver modificato il disegno:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\make-icons.ps1
```

Il service worker usa la strategia *rete per prima*: un deploy si vede al primo ricaricamento,
la cache serve solo da riserva offline. Se dopo una modifica il browser mostra ancora il codice
vecchio, fai un ricaricamento forzato (`Ctrl+Shift+R`) o alza `VERSION` in `sw.js`.
