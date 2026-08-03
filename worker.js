/* Toegangspoort voor Cloudflare Workers.
   Verzoeken naar /api/... gaan naar de functies, al de rest zijn gewone
   bestanden: index.html, sw.js, de PDF.

   Op Netlify wordt dit bestand niet gebruikt; daar draaien de functies uit
   netlify/functions/ en serveert Netlify de bestanden zelf.                */

import { onRequestGet as delijn } from './functions/api/delijn.js';
import { onRequestGet as vlucht } from './functions/api/vlucht.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const context = { request, env, waitUntil: p => ctx.waitUntil(p) };

    if (url.pathname === '/api/delijn') return delijn(context);
    if (url.pathname === '/api/vlucht') return vlucht(context);

    /* Alles wat geen functie is, komt uit de bestanden. */
    return env.ASSETS.fetch(request);
  }
};
