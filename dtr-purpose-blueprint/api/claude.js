/* ============================================================
   Purpose Blueprint - Claude endpoint (hardened)

   This endpoint spends real money on every call, so it only
   accepts requests that look exactly like the Purpose Blueprint
   app's one request. Anything else is rejected before it ever
   reaches Anthropic, which means it cannot be used as a free
   general-purpose Claude proxy by anyone who finds the URL.

   Deliberately ASCII-only: pasting non-ASCII through the GitHub
   web editor corrupts it (this already happened once to an em
   dash in index.html).
============================================================ */

/* The app always asks for 8000. The caller never gets to choose,
   because output tokens are the expensive half of the bill. */
const MAX_OUTPUT_TOKENS = 8000;

/* MASTER_PROMPT alone is 8859 chars, so a real request is always
   well above the floor. Floor blocks casual abuse; ceiling blocks
   someone padding the input to run up the input bill. */
const MIN_CONTENT_CHARS = 4000;
const MAX_CONTENT_CHARS = 120000;

/* Built by the app's own code (index.html), not by prompt prose,
   so these stay stable even if the prompt wording is rewritten. */
const REQUIRED_MARKERS = ["PERSON'S NAME:", 'INTERVIEW ANSWERS:'];

function reject(res, code, reason) {
  /* Deliberately vague to the caller, specific in the log. */
  console.warn('[claude] rejected:', reason);
  return res.status(code).json({ error: 'Bad request' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[claude] ANTHROPIC_API_KEY is not set');
    return res.status(500).json({ error: 'Server not configured' });
  }

  const body = req.body || {};
  const messages = body.messages;

  /* Exactly one user message - the app never sends more. */
  if (!Array.isArray(messages) || messages.length !== 1) {
    return reject(res, 400, 'expected exactly 1 message');
  }

  const msg = messages[0];
  if (!msg || msg.role !== 'user' || typeof msg.content !== 'string') {
    return reject(res, 400, 'message must be a user message with string content');
  }

  const content = msg.content;

  if (content.length < MIN_CONTENT_CHARS) {
    return reject(res, 400, 'content too short: ' + content.length);
  }
  if (content.length > MAX_CONTENT_CHARS) {
    return reject(res, 413, 'content too long: ' + content.length);
  }

  /* The real protection: this must be a Purpose Blueprint request,
     not an arbitrary prompt. */
  for (const marker of REQUIRED_MARKERS) {
    if (!content.includes(marker)) {
      return reject(res, 400, 'missing required marker: ' + marker);
    }
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-8',
        /* Server decides this, never the caller. */
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('[claude] anthropic error:', data.error.type, data.error.message);
      return res.status(502).json({ error: data.error.message });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('[claude] upstream failure:', err && err.message);
    return res.status(502).json({ error: 'Upstream request failed' });
  }
}
