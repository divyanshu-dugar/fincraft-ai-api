const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Minimum data required before we bother calling the LLM. These are intentionally
// low so a single month with a handful of entries still gets a response.
const MIN_ENTRIES = 3;
const MIN_TOTAL = 1;

function buildSystemPrompt(kind) {
  const isExpense = kind === 'expense';
  const subject = isExpense ? 'expense' : 'income';
  const focusRules = isExpense
    ? `- Flag overspending, category concentration, month-on-month spikes, and anomalies.
- Suggest concrete changes (e.g., "set a $X monthly cap for Y", "consider meal prepping", "review recurring subscriptions").`
    : `- Highlight growth trends, source concentration/diversification, volatility, and dry months.
- Suggest concrete next steps (e.g., "diversify by adding a side source", "route $X/mo of paycheck to savings", "build a 3-month buffer").`;

  return `You are a personal finance assistant analyzing a user's ${subject} data.
Return STRICT JSON only (no prose outside the JSON) matching this exact shape:
{
  "headline": "one-sentence summary of the period",
  "insights": [
    { "title": "short title", "detail": "1-2 sentences with specific $ amounts and % comparisons", "severity": "positive" | "warning" | "info" }
  ],
  "recommendations": [
    { "title": "short action title", "action": "1-2 sentence concrete next step" }
  ]
}
Rules:
- 3 to 5 insights. 2 to 4 recommendations.
- Reference real category names and months that appear in the user's data. Do not invent categories.
- Cite specific numbers from the data ($ amounts, percentage changes).
- Use "warning" for risks, "positive" for good patterns, "info" otherwise.
${focusRules}`;
}

function buildUserPrompt(kind, range, summary) {
  return `Kind: ${kind}
Date range: ${range?.startMonth || '?'} to ${range?.endMonth || '?'}
Aggregated analytics (all amounts in USD):
${JSON.stringify(summary, null, 2)}`;
}

function shapeResponse(parsed) {
  const headline = typeof parsed?.headline === 'string' ? parsed.headline.slice(0, 240) : '';

  const cleanInsight = (i) => ({
    title: typeof i?.title === 'string' ? i.title.slice(0, 120) : '',
    detail: typeof i?.detail === 'string' ? i.detail.slice(0, 500) : '',
    severity: ['positive', 'warning', 'info'].includes(i?.severity) ? i.severity : 'info',
  });
  const cleanRec = (r) => ({
    title: typeof r?.title === 'string' ? r.title.slice(0, 120) : '',
    action: typeof r?.action === 'string' ? r.action.slice(0, 500) : '',
  });

  const insights = Array.isArray(parsed?.insights)
    ? parsed.insights.map(cleanInsight).filter((i) => i.title && i.detail).slice(0, 6)
    : [];
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations.map(cleanRec).filter((r) => r.title && r.action).slice(0, 5)
    : [];

  return { headline, insights, recommendations };
}

exports.generateAnalyticsInsights = async (req, res) => {
  try {
    const { kind, range, summary } = req.body || {};

    if (!['expense', 'income'].includes(kind)) {
      return res.status(400).json({ error: 'kind must be "expense" or "income"' });
    }
    if (!range || !summary) {
      return res.status(400).json({ error: 'range and summary are required' });
    }

    const totalAmount = Number(summary.totalAmount || 0);
    const entryCount = Number(summary.entryCount || 0);
    const monthsWithData = Array.isArray(summary.monthlyTotals)
      ? summary.monthlyTotals.filter((m) => Number(m?.amount) > 0).length
      : 0;

    if (totalAmount < MIN_TOTAL || entryCount < MIN_ENTRIES || monthsWithData < 1) {
      return res.json({
        needsData: true,
        reason:
          entryCount < MIN_ENTRIES
            ? `Need at least ${MIN_ENTRIES} entries to generate meaningful insights (found ${entryCount}).`
            : monthsWithData < 1
            ? 'No months in the selected range contain data.'
            : 'Not enough activity in the selected range.',
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'AI service is not configured' });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: buildSystemPrompt(kind) },
        { role: 'user', content: buildUserPrompt(kind, range, summary) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.4,
    });

    const text = completion?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: 'AI returned invalid JSON' });
    }

    return res.json(shapeResponse(parsed));
  } catch (err) {
    console.error('AI analytics insights failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate insights' });
  }
};
