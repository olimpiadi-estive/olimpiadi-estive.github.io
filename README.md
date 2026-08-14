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

| Formato | Cosa genera | Rendering |
|---|---|---|
| **Tutti contro tutti** | niente: è una gara unica con tutti in campo insieme | solo la classifica finale |
| **Scontri diretti** | ogni partecipante affronta gli altri una volta sola, `n(n-1)/2` partite divise in giornate, senza ritorno | elenco incontri + classifica |
| **Eliminazione diretta** | tabellone da `n-1` partite, con turno di playoff se `n` non è potenza di due | turni affiancati, scorrevoli |

### Playoff quando i partecipanti non sono 2, 4, 8, 16…

Invece di regalare un bye a chi capita in cima all'elenco, si gioca un **turno di playoff**: detto
`P` la potenza di due immediatamente sotto `n`, gli ultimi `2 × (n − P)` partecipanti si affrontano fra
loro e i vincitori entrano nel tabellone da `P` posti. Con l'ordine mescolato chi va ai playoff è
sorteggiato; con l'ordine di iscrizione vanno ai playoff gli ultimi registrati, così le teste di serie
restano protette.

Con 10 partecipanti: 2 partite di playoff fra 4 sorteggiati, 6 entrano diretti, tabellone da 8, in
totale 4 turni e 9 partite. Il totale è sempre `n − 1`, qualunque sia `n`.

Ogni incontro porta scritto **dove va il vincitore** (campo `prossimo`, nella forma `turno.ordine.lato`),
perché dopo un playoff il numero di partite non si dimezza e la regola implicita non basterebbe. Nel
tabellone i posti ancora vuoti mostrano *"vincente Playoff 2"* invece di un generico "da definire", e
il campo è modificabile a mano se vuoi cambiare l'incrocio.

L'algoritmo ha un test: `powershell -File tools\verifica-tabellone.ps1` controlla, da 2 a 17
partecipanti, che le partite siano `n−1`, che i posti vuoti nel tabellone corrispondano ai playoff e
che due vincitori non finiscano mai nello stesso slot.

Con 10 partecipanti: scontri diretti fa 45 partite in 9 giornate, 9 incontri a testa; eliminazione
diretta fa un tabellone da 16 con 4 turni, 9 partite e 6 passaggi automatici al primo turno.
La previsione esatta compare nella finestra di generazione prima di confermare.

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

## Gare "tutti contro tutti" e classifica finale

Una disciplina "tutti contro tutti" genera **una gara** con tutti i concorrenti dentro, oppure più
**batterie** con i concorrenti distribuiti a serpentina. Ogni gara ha il pulsante **Arrivi**, che apre
l'editor ordinato dei suoi soli concorrenti.

I risultati sono di due tipi, e la distinzione serve a non moltiplicare le medaglie:

| Tipo | Come si riconosce | Assegna medaglie |
|---|---|---|
| Arrivo di una gara o batteria | ha `incontroId` | no |
| Classifica finale della disciplina | `incontroId` vuoto | **sì**: oro, argento, bronzo ai primi tre |

Per collegarli ci sono due scorciatoie:

- Nell'editor degli arrivi, la casella **"Aggiorna anche la classifica finale"** (già spuntata quando
  c'è una sola gara): salvi una volta e la finale si allinea.
- In Admin ▸ Classifiche, il pulsante **⚡ Dagli arrivi** ricompone la finale dagli arrivi di tutte le
  gare. Con più batterie intreccia le posizioni: prima tutti i primi classificati, poi tutti i
  secondi, e così via. È un punto di partenza ragionevole, poi la aggiusti a mano con le frecce.

## Diagnostica della sincronizzazione

Tocca la **spia dell'ora** in alto a destra, oppure vai su `#/debug` o Admin ▸ Impostazioni ▸
*Diagnostica sync*. La schermata mostra ultimo sync riuscito e durata, errori consecutivi, se i dati
vengono dalla cache locale, revisione dei dati, stato del service worker e il log delle ultime
richieste con durata ed esito (conservato anche tra un riavvio e l'altro).

**▶ Esegui test** fa cinque letture consecutive e riporta latenza media e massima: è il modo per
distinguere un problema di rete da un Apps Script lento. Sopra i 10 secondi di picco il messaggio lo
segnala, perché a 15 la lettura scade. **Copia rapporto** mette tutto negli appunti in forma testuale.
**Svuota cache e ricarica** disinstalla il service worker e riparte pulito, utile quando il browser
serve una versione vecchia.

Le richieste hanno un timeout (15 secondi in lettura con un secondo tentativo, 45 in scrittura perché
le generazioni scrivono decine di righe) e una guardia che dopo 20 secondi considera persa una
richiesta rimasta appesa. Senza queste protezioni una singola richiesta bloccata impediva **tutti** i
sync successivi, in silenzio, fino al ricaricamento della pagina.

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
