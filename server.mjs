import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const base = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL;
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.png':'image/png', '.svg':'image/svg+xml', '.txt':'text/plain; charset=utf-8' };

function send(res, status, data, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store' });
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'POST' && url.pathname === '/api/chat') {
      if (!apiKey || !model) return send(res, 503, { error:'The online assistant is not configured yet.' });
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 10000) return send(res, 413, { error:'Please keep your message shorter.' });
      }
      let body;
      try { body = JSON.parse(raw); } catch { return send(res, 400, { error:'Please send a valid message.' }); }
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      if (!message || message.length > 2000) return send(res, 400, { error:'Please enter a question under 2,000 characters.' });

      const instructions = `You are the friendly website assistant for West Electrical Engineering Technology in Ghana. Answer the visitor's question directly and helpfully on any general topic. Keep answers concise and understandable. If a message is a direct insult, slur, or abusive attack, do not answer its substance; politely ask the visitor to keep the conversation respectful. Do not mistake a respectful question discussing insults or abuse for an insult. For business facts, use only these: electrical wiring and rewiring, automatic changeovers, three-phase motors, generator connections, fault finding and repairs, distribution boards, lighting and sockets, earthing, and AVP/voltage protection; service areas are Esiama, Accra and Kumasi; phone/WhatsApp 054 684 8962, 020 841 2718, 024 043 5149; email suleywest06@gmail.com. Never invent prices, guarantees, licenses, availability, or technical specifications. For dangerous electrical situations, tell the visitor to switch off power only if safe and contact a qualified electrician; do not give step-by-step instructions for live wiring, bypassing protection, or other dangerous electrical work. When useful, invite the visitor to contact the company on WhatsApp.`;
      const upstream = await fetch('https://api.openai.com/v1/responses', {
        method:'POST',
        headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ model, instructions, input:message, max_output_tokens:450, store:false })
      });
      const result = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        console.error('AI provider returned status', upstream.status);
        return send(res, 502, { error:'The assistant could not answer just now. Please try again or contact us on WhatsApp.' });
      }
      const reply = result.output_text || (result.output || []).flatMap(item => item.content || []).filter(part => part.type === 'output_text').map(part => part.text).join('\n').trim();
      return send(res, 200, { reply: reply || 'Please try asking that another way.' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error:'Method not allowed.' });
    let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (requested.includes('..') || requested.includes('\\')) return send(res, 400, { error:'Invalid path.' });
    const file = path.join(base, requested.replace(/^\/+/, ''));
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options':'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch (error) {
    if (error?.code === 'ENOENT') return send(res, 404, { error:'Not found.' });
    console.error('Request failed:', error?.message || error);
    if (!res.headersSent) send(res, 500, { error:'The site could not complete that request.' });
    else res.destroy();
  }
});

server.listen(port, () => console.log(`West Electrical website listening on port ${port}`));
