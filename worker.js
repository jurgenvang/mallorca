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

  const q = new URLSearchParams({ access_key: key, flight_iata: nr, limit: '3' });
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum)) q.set('flight_date', datum);

  try {
    /* Het gratis tarief van Aviationstack werkt alleen over http.
       Vanaf de server is dat geen probleem. */
    const res = await fetch('http://api.aviationstack.com/v1/flights?' + q);
    const j = await res.json();

    if (j && j.error) return bewaarEnGeef({
      fout: j.error.message || 'Aviationstack gaf een fout',
      uitleg: (j.error.code === 'usage_limit_reached')
        ? 'Het gratis tarief is op voor deze maand.' : 'Controleer de sleutel.'
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

/* ---------------- toegangspoort ---------------- */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname === '/api/delijn') return delijn(request, env);
    if (url.pathname === '/api/vlucht') return vlucht(request, env, ctx);

    /* Alles wat geen functie is, komt uit de bestanden. */
    return env.ASSETS.fetch(request);
  }
};
