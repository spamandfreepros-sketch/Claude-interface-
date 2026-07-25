export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, max_tokens } = req.body;
  if (!messages) {
    return res.status(400).json({ error: 'Missing messages' });
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: max_tokens || 4096,
      messages,
    }),
  });

  const data = await response.json();

  if (data.error) {
    return res.status(500).json({ error: data.error.message });
  }

  res.status(200).json(data);
}
