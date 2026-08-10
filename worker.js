/* Toegangspoort voor Cloudflare Workers.

   Verzoeken naar /api/... worden hier afgehandeld, al de rest zijn gewone
   bestanden: index.html, sw.js, de PDF.

   De code van beide functies staat hieronder volledig uitgeschreven, zonder
   imports. Dat is bewust: Wrangler bundelt vanuit de hoofdmap en kan bestanden
   uit de assets-map niet als module inladen. De versies in functions/api/
   blijven bestaan voor wie het klassieke Cloudflare Pages gebruikt.

   Op Netlify wordt dit bestand niet gebruikt.
   Sleutels: DELIJN_KEY en AVIATIONSTACK_KEY, in te stellen in het dashboard.  */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8'
};
const json = (obj, status, extra) =>
  new Response(typeof obj === 'string' ? obj : JSON.stringify(obj),
               { status, headers: Object.assign({}, CORS, extra) });

/* ---------------- De Lijn ---------------- */
async function delijn(request, env) {
  const kop = { 'Cache-Control': 'public, max-age=15, s-maxage=20' };
  const kort = { 'Cache-Control': 'public, max-age=0, s-maxage=30' };

  const key = env.DELIJN_KEY;
  if (!key) return json({
    fout: 'geen sleutel',
    uitleg: 'Zet DELIJN_KEY bij Settings, Variables and Secrets, en publiceer opnieuw.'
  }, 500, kort);

  const p = new URL(request.url).searchParams;
  const mode = p.get('mode') || 'realtime';
  const basis = 'https://api.delijn.be/DLKernOpenData/api/v1';
  let url;

  if (mode === 'indebuurt') {
    const lat = parseFloat(p.get('lat'));
    const lon = parseFloat(p.get('lon'));
    if (!isFinite(lat) || !isFinite(lon))
      return json({ fout: 'ontbrekende plaats' }, 400, kort);
    const straal = (p.get('straal') || '750').replace(/\D/g, '') || '750';
    url = `${basis}/haltes/indebuurt/${lat},${lon}?startIndex=0&maxAantalHaltes=15&straal=${straal}`;
  } else if (mode === 'entiteiten') {
    url = `${basis}/entiteiten`;
  } else {
    const ent = (p.get('ent') || '').replace(/\D/g, '');
    const halte = (p.get('halte') || '').replace(/\D/g, '');
    if (!ent || !halte) return json({ fout: 'ontbrekende halte' }, 400, kort);
    url = `${basis}/haltes/${ent}/${halte}/real-time`;
  }

  try {
    const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
    const tekst = await res.text();
    if (!res.ok) return json({
      fout: 'De Lijn antwoordde met status ' + res.status,
      uitleg: res.status === 401 ? 'De sleutel wordt geweigerd.' : 'Controleer entiteit- en haltenummer.'
    }, res.status, kort);
    return json(tekst, 200, kop);
  } catch (e) {
    return json({ fout: 'De Lijn niet bereikbaar' }, 502, kort);
  }
}

/* ---------------- vluchtstatus ---------------- */
async function vlucht(request, env, ctx) {
  const kop = { 'Cache-Control': 'public, max-age=120, s-maxage=600' };
  const kort = { 'Cache-Control': 'public, max-age=0, s-maxage=30' };

  /* Antwoorden tien minuten bewaren, zodat vier toestellen samen
     een opvraging kosten in plaats van vier. */
  const cache = caches.default;
  const sleutel = new Request(new URL(request.url).toString(), { method: 'GET' });
  const bewaard = await cache.match(sleutel);
  if (bewaard) return bewaard;

  const bewaarEnGeef = (obj, status, extra) => {
    const res = json(obj, status, extra);
    if (status === 200 && ctx) ctx.waitUntil(cache.put(sleutel, res.clone()));
    return res;
  };

  const key = env.AVIATIONSTACK_KEY;
  if (!key) return bewaarEnGeef({
    fout: 'geen sleutel',
    uitleg: 'Zet AVIATIONSTACK_KEY bij Settings, Variables and Secrets.'
  }, 500, kort);

  const p = new URL(request.url).searchParams;
  const nr = (p.get('nr') || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const datum = (p.get('datum') || '').slice(0, 10);
  if (!/^[A-Z]{2}\d{1,4}$/.test(nr))
    return bewaarEnGeef({ fout: 'ongeldig vluchtnummer' }, 400, kort);

  /* Het gratis tarief kent geen opvraging per datum: flight_date valt onder de
     betalende toegang. We vragen dus eerst zonder datum - dat geeft de vlucht
     van vandaag - en proberen mét datum alleen als dat niets oplevert. */
  const bouwUrl = (metDatum) => {
    const q = new URLSearchParams({ access_key: key, flight_iata: nr, limit: '3' });
    if (metDatum && /^\d{4}-\d{2}-\d{2}$/.test(datum)) q.set('flight_date', datum);
    /* Het gratis tarief werkt alleen over http. Vanaf de server is dat geen probleem. */
    return 'http://api.aviationstack.com/v1/flights?' + q;
  };

  try {
    let res = await fetch(bouwUrl(false));
    let j = await res.json();

    if ((!j || j.error || !(j.data && j.data.length)) && datum) {
      const res2 = await fetch(bouwUrl(true));
      const j2 = await res2.json();
      if (j2 && !j2.error && j2.data && j2.data.length) j = j2;
    }

    if (j && j.error) return bewaarEnGeef({
      fout: j.error.message || j.error.type || j.error.code || 'Aviationstack gaf een fout',
      code: j.error.code || j.error.type || null,
      uitleg: (String(j.error.code).includes('usage_limit'))
        ? 'Het maandbudget van het gratis tarief is op.'
        : (String(j.error.code).includes('function_access') || String(j.error.code).includes('restricted'))
          ? 'Deze opvraging valt buiten het gratis tarief.'
          : 'Aviationstack weigert de aanvraag.'
    }, 502, kort);

    const v = (j && j.data && j.data[0]) || null;
    if (!v) return bewaarEnGeef({
      fout: 'geen gegevens',
      uitleg: 'Vluchtgegevens verschijnen meestal pas enkele dagen voor vertrek.'
    }, 404, kort);

    return bewaarEnGeef({
      nummer: (v.flight && v.flight.iata) || nr,
      status: v.flight_status || null,
      datum: v.flight_date || datum || null,
      vertrek: {
        luchthaven: v.departure && v.departure.airport,
        iata: v.departure && v.departure.iata,
        terminal: v.departure && v.departure.terminal,
        gate: v.departure && v.departure.gate,
        gepland: v.departure && v.departure.scheduled,
        verwacht: (v.departure && (v.departure.estimated || v.departure.actual)) || null,
        vertraging: v.departure && v.departure.delay
      },
      aankomst: {
        luchthaven: v.arrival && v.arrival.airport,
        iata: v.arrival && v.arrival.iata,
        terminal: v.arrival && v.arrival.terminal,
        band: v.arrival && v.arrival.baggage,
        gepland: v.arrival && v.arrival.scheduled,
        verwacht: (v.arrival && (v.arrival.estimated || v.arrival.actual)) || null,
        vertraging: v.arrival && v.arrival.delay
      }
    }, 200, kop);

  } catch (e) {
    return bewaarEnGeef({ fout: 'Aviationstack niet bereikbaar' }, 502, kort);
  }
}

/* ---------------- reistijd met verkeer ---------------- */
async function route(request, env) {
  const kop = { 'Cache-Control': 'public, max-age=120, s-maxage=300' };
  const kort = { 'Cache-Control': 'public, max-age=0, s-maxage=30' };

  const key = env.TOMTOM_KEY;
  if (!key) return json({
    fout: 'geen sleutel',
    uitleg: 'Zet TOMTOM_KEY bij Settings, Variables and Secrets.'
  }, 500, kort);

  const p = new URL(request.url).searchParams;
  const punt = /^-?\d{1,3}\.\d+,-?\d{1,3}\.\d+$/;
  const van = (p.get('van') || '').trim();
  const naar = (p.get('naar') || '').trim();
  if (!punt.test(van) || !punt.test(naar)) return json({ fout: 'ongeldige coordinaten' }, 400, kort);

  const q = new URLSearchParams({ key, traffic: 'true', computeTravelTimeFor: 'all', routeType: 'fastest' });
  const vertrek = p.get('vertrek');
  if (vertrek && /^\d{4}-\d{2}-\d{2}T/.test(vertrek)) q.set('departAt', vertrek);

  try {
    const res = await fetch(`https://api.tomtom.com/routing/1/calculateRoute/${van}:${naar}/json?${q}`);
    if (!res.ok) return json({ fout: 'TomTom antwoordde met status ' + res.status }, res.status, kort);
    const j = await res.json();
    const r = j && j.routes && j.routes[0] && j.routes[0].summary;
    if (!r) return json({ fout: 'geen route gevonden' }, 404, kort);
    return json({
      minuten: Math.round(r.travelTimeInSeconds / 60),
      minutenZonderVerkeer: r.noTrafficTravelTimeInSeconds
        ? Math.round(r.noTrafficTravelTimeInSeconds / 60) : null,
      vertragingMinuten: r.trafficDelayInSeconds ? Math.round(r.trafficDelayInSeconds / 60) : 0,
      kilometer: Math.round(r.lengthInMeters / 100) / 10,
      aankomst: r.arrivalTime || null
    }, 200, kop);
  } catch (e) {
    return json({ fout: 'TomTom niet bereikbaar' }, 502, kort);
  }
}

/* ---------------- toegangspoort ---------------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    /* Netlify-adressen bestaan hier niet. Zonder deze regel zou de instelling
       voor eenpagina-apps er index.html op teruggeven met status 200, en dan
       denkt de app ten onrechte dat de functie bestaat. */
    if (url.pathname.startsWith('/.netlify/')) {
      return json({ fout: 'niet hier', uitleg: 'Op Cloudflare gebruik je /api/...' }, 404, {});
    }
    if (url.pathname === '/api/delijn') return delijn(request, env);
    if (url.pathname === '/api/vlucht') return vlucht(request, env, ctx);
    if (url.pathname === '/api/route') return route(request, env);

    /* Alles wat geen functie is, komt uit de bestanden. */
    return env.ASSETS.fetch(request);
  }
};
