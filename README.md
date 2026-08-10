# Canyamel, 10 tot 19 augustus 2026

Reisplanner voor een gezinsvakantie op Mallorca, met de totale zonsverduistering
van 12 augustus als hoogtepunt. Een enkele HTML-pagina, twee serverfuncties en
een reisgids als PDF.

**Versie 2026.08.09-2** — het versienummer staat onderaan in de app en in het
instellingenscherm, zodat je kunt zien of wat online staat overeenkomt met deze
broncode.

---

## Wat zit erin

| Bestand | Waarvoor |
|---|---|
| `index.html` | de app zelf, alles in een bestand |
| `sw.js` | laat de app offline werken |
| `netlify.toml` | configuratie voor Netlify |
| `netlify/functions/delijn.js` | busgegevens, Netlify-vorm |
| `netlify/functions/vlucht.js` | vluchtstatus, Netlify-vorm |
| `netlify/functions/route.js` | reistijd met verkeer, Netlify-vorm |
| `functions/api/delijn.js` | dezelfde functie, Cloudflare-vorm |
| `functions/api/vlucht.js` | dezelfde functie, Cloudflare-vorm |
| `functions/api/route.js` | reistijd met verkeer, Cloudflare-vorm |
| `Mallorca_Canyamel_10-19_augustus_2026.pdf` | de volledige reisgids |
| `functions/api/…` | dezelfde functies, Cloudflare-vorm |
| `worker.js` | toegangspoort voor Cloudflare Workers, zelfvoorzienend |
| `wrangler.jsonc` | configuratie voor Cloudflare Workers |
| `.env.example` | welke sleutels nodig zijn, zonder de waarden |

Beide functiemappen mogen naast elkaar blijven staan. Netlify kijkt in
`netlify/functions/`, Cloudflare in `functions/api/`. De app probeert vanzelf
eerst het ene adres en dan het andere, en onthoudt welke werkte.

## Snel proberen

Dubbelklik `index.html`. Alles werkt, behalve de live bus- en vluchtgegevens en
het offline bewaren — daarvoor moet de app op een echt webadres staan.

---

## Op GitHub zetten

```bash
cd canyamel-2026
git init
git add .
git commit -m "Reisplanner Canyamel augustus 2026"
git branch -M main
git remote add origin https://github.com/JOUWNAAM/canyamel-2026.git
git push -u origin main
```

Zet de repository op **private** als je hem niet wilt delen. Beide hostingdiensten
kunnen ook privérepositories lezen.

## Netlify koppelen aan GitHub

1. **Add new site** → **Import an existing project** → **GitHub**, en kies de repository.
2. Build command: **leeg laten**. Publish directory: **`.`**
   (`netlify.toml` zet dit al goed, dus meestal hoef je niets in te vullen.)
3. **Site configuration** → **Environment variables**:
   `DELIJN_KEY`, `AVIATIONSTACK_KEY` en `TOMTOM_KEY`.
4. Na het instellen van variabelen: **Deploys** → **Trigger deploy**.

## Cloudflare koppelen aan GitHub

Cloudflare maakt bij een Git-koppeling tegenwoordig een **Worker** aan, geen
Pages-project. Daarom zitten `worker.js` en `wrangler.jsonc` in deze repository:
zonder die twee weet de Worker niet dat hij de bestanden moet serveren, en zie
je "No active routes".

1. **Workers & Pages** → **Create** → **Import a repository**, kies de repository.
2. Build command: **leeg**. Deploy command: **leeg**. Wrangler vindt de rest zelf.
3. **Settings** → **Variables and Secrets**: `DELIJN_KEY` en `AVIATIONSTACK_KEY`,
   allebei als **Secret** (versleuteld).
4. **Settings** → **Domains & Routes**: zet het adres
   `mallorca.JOUWNAAM.workers.dev` aan als dat nog niet gebeurd is.
5. Opnieuw publiceren.

`worker.js` bevat de code van beide functies volledig uitgeschreven, zonder
imports. Wrangler bundelt vanuit de hoofdmap en kan bestanden uit de assets-map
niet als module inladen; een import naar `functions/api/…` geeft daar
`Could not resolve`. De bestanden in `functions/api/` blijven staan voor wie het
klassieke Cloudflare Pages gebruikt.

Let op: pas je een functie aan, pas ze dan op beide plekken aan.

Het adres is dan `https://mallorca.JOUWNAAM.workers.dev`. Wil je liever het
oude Pages-model met een `.pages.dev`-adres, kies dan bij het aanmaken
uitdrukkelijk **Pages** in plaats van de Git-import; dan zijn `worker.js` en
`wrangler.jsonc` overbodig maar ook onschadelijk.

Vanaf dan publiceert elke `git push` op allebei tegelijk.

### Waarom dit niet botst

Cloudflare zet ook de map `netlify/` als gewone bestanden online. Dat is
onschadelijk: die functies bevatten geen sleutels, alleen code die naar een
omgevingsvariabele vraagt. Netlify negeert `functions/` omdat `netlify.toml`
uitdrukkelijk naar `netlify/functions` wijst.

### Zuinig met Aviationstack

Het gratis tarief geeft 100 opvragingen per maand. De app blijft daar ruim
onder:

- verder dan anderhalve dag voor de vlucht wordt er niets opgevraagd
- daarbinnen hoogstens een keer per uur, vanaf twaalf uur voor vertrek elk
  kwartier, en in de laatste vier uur elke vijf minuten
- antwoorden worden bewaard en hergebruikt
- een harde grens van 60 per maand, met een knop om zelf te verversen

Onder het paneel staat hoeveel opvragingen deze maand gebruikt zijn en wanneer
de gegevens laatst zijn bijgewerkt.

### Ook de server bewaart antwoorden

Bovenop de spaarzaamheid in de app bewaart ook de host het antwoord, zodat vier
toestellen samen een opvraging kosten in plaats van vier:

| | Netlify | Cloudflare |
|---|---|---|
| vluchtstatus | tien minuten, duurzaam | tien minuten |
| busdoorkomsten | twintig seconden | twintig seconden |
| foutmeldingen | dertig seconden | dertig seconden |

Netlify doet dat met de kop `Netlify-CDN-Cache-Control`, Cloudflare met
`caches.default` in de functie zelf. Beide staan al ingesteld; je hoeft niets
te doen.

### Sleutels

Die staan bij de host, niet in de repository. `.gitignore` houdt `.env` buiten
Git, en `.env.example` toont alleen welke namen nodig zijn. Zet je sleutels dus
tweemaal in: een keer bij Netlify, een keer bij Cloudflare.

---

## Controleren of het werkt

| Adres | Verwacht |
|---|---|
| `/.netlify/functions/delijn?mode=entiteiten` | lijst met gegevens |
| `/api/delijn?mode=entiteiten` | idem, op Cloudflare |
| `/.netlify/functions/vlucht?nr=VY3651&datum=2026-08-10` | vluchtgegevens |
| `/.netlify/functions/route?van=50.873,4.762&naar=50.9014,4.4844` | reistijd met verkeer |

- `"fout": "geen sleutel"` → de variabele ontbreekt, of er is niet opnieuw gepubliceerd
- `"geen gegevens"` bij de vlucht → normaal zolang de vlucht nog ver weg is
- een 404 → de functie staat niet op de juiste plek

## Halte instellen in de app

Drie puntjes rechtsboven → **Haltes in de buurt zoeken**. De app haalt de haltes
rond het vertrekadres op en vult entiteit- en haltenummer zelf in. Kies de juiste
halte, druk op **Verbinding testen**, dan op **Opslaan**. Het veld voor de sleutel
blijft leeg als je hem bij de host hebt gezet.

---

## De app in het kort

- **Planning** — dagoverzicht, weer per locatie (Canyamel, Palma voor de
  Aqualand-dag, de kijkplek voor de eclips), vluchtstatus met gate en vertraging,
  live treinen en busdoorkomsten, en voorstellen om dagen te ruilen als het weer
  tegenzit
- **Paklijst** — afvinkbaar, blijft bewaard op het toestel
- **Budget** — vink posten aan en uit, het totaal rekent mee
- **Info** — noodnummers, verkeersregels, reisgegevens, downloads

Op een telefoon kun je de pagina aan het beginscherm toevoegen. Open de app een
keer met verbinding, dan werkt ze daarna ook zonder netwerk.

---

## Het belangrijkste uit de reisgids

| Wanneer | Wat |
|---|---|
| **wo 12 aug 20:31** | totale zonsverduistering, ca. anderhalve minuut. **Niet zichtbaar vanuit Canyamel**: de zon staat maar 2 graden boven de horizon en het eiland ligt ervoor. Rijd naar Far de Cap Blanc of Cap de ses Salines. Eclipsbrillen ISO 12312-2 vooraf kopen. |
| zo 9 aug 18:55 | online inchecken heenvlucht opent |
| di 18 aug 15:15 | online inchecken terugvlucht opent |
| handbagage | 40 x 30 x 20 cm per persoon: een rugzak, geen trolley |
| ruimbagage | vooraf boeken vanaf 10 euro, aan de balie een veelvoud |
| za 15 aug | Spaanse feestdag, reserveer je restaurant |
| 8 t/m 16 aug | Sant Roc in Cala Ratjada, vuurwerk op zondag de 16de |
| wandeling | loop de lus tegen de klok in: eerst klimmen, dan de kust |
