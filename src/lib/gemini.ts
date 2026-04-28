import { GoogleGenAI, Type, type Content, type Schema, type Tool } from '@google/genai';

const MODEL_ID = 'gemini-2.5-flash';

export type StructuredMeetingOutput = {
  summary: string;
  agenda_items: string[];
  action_items: { item: string; pic_name: string | null; due_date: string | null }[];
  sentiment: 'positive' | 'neutral' | 'negative' | null;
};

export type MeetingTranscriptInput = {
  transcript: string;
  client_name?: string | null;
  investor_name?: string | null;
  meeting_date?: string | null;
  attendee_names?: string[];
  meeting_type: 'internal' | 'briefing';
};

const STRUCTURED_MEETING_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description:
        'Concise executive summary of the meeting in 2–4 sentences. Plain prose, no headings or bullets.',
    },
    agenda_items: {
      type: Type.ARRAY,
      description: 'Distinct topics discussed in the meeting, in the order they came up.',
      items: { type: Type.STRING },
    },
    action_items: {
      type: Type.ARRAY,
      description:
        'Concrete follow-ups with an owner. Only include items with a clear deliverable; skip vague aspirations.',
      items: {
        type: Type.OBJECT,
        properties: {
          item: { type: Type.STRING, description: 'What needs to be done.' },
          pic_name: {
            type: Type.STRING,
            description:
              'Name of the person responsible if mentioned. Use exactly the name as it appears in the transcript or attendee list. Use empty string if unclear.',
          },
          due_date: {
            type: Type.STRING,
            description:
              'Due date in YYYY-MM-DD if explicitly mentioned. Use empty string if not stated. Resolve relative dates ("next Friday") against the meeting date.',
          },
        },
        required: ['item', 'pic_name', 'due_date'],
        propertyOrdering: ['item', 'pic_name', 'due_date'],
      },
    },
    sentiment: {
      type: Type.STRING,
      description:
        'Overall sentiment of the briefing toward the client. Use "neutral" when uncertain. Only meaningful for client/investor briefings.',
      enum: ['positive', 'neutral', 'negative'],
    },
  },
  required: ['summary', 'agenda_items', 'action_items', 'sentiment'],
  propertyOrdering: ['summary', 'agenda_items', 'action_items', 'sentiment'],
};

const SYSTEM_INSTRUCTION = `You structure raw meeting notes for an investor relations / public relations firm in Malaysia.
Input is a transcript or rough notes (often pasted from Notta) plus light meta about the meeting.
Your output is strict JSON matching the provided schema. Be faithful to the source — do NOT invent facts, attendees, dates, or commitments. If something is unclear, leave the relevant field empty rather than guessing.
Write in clear business English. Keep the summary tight; do not pad.`;

function buildPrompt(input: MeetingTranscriptInput): string {
  const meta: string[] = [];
  meta.push(`Meeting type: ${input.meeting_type === 'internal' ? 'Internal team meeting' : 'Client / investor briefing'}`);
  if (input.meeting_date) meta.push(`Meeting date: ${input.meeting_date}`);
  if (input.client_name) meta.push(`Client: ${input.client_name}`);
  if (input.investor_name) meta.push(`Investor / fund: ${input.investor_name}`);
  if (input.attendee_names?.length) meta.push(`Attendees: ${input.attendee_names.join(', ')}`);

  return `${meta.join('\n')}\n\n--- TRANSCRIPT ---\n${input.transcript}\n--- END TRANSCRIPT ---`;
}

// ──────────────────────────────────────────────────────────────────────────
// Multi-key failover. Free-tier keys hit per-minute and per-day caps, so we
// allow more than one key and rotate to the next on rate-limit errors.
//
// Configure either:
//   GEMINI_API_KEY=key1,key2,key3        ← comma-separated list
//   GEMINI_API_KEYS=key1,key2,key3       ← alias, also comma-separated
//   GEMINI_API_KEY_2=…  GEMINI_API_KEY_3=…  ← numbered slots (up to _10)

function getApiKeys(): string[] {
  const collected: string[] = [];
  const splitList = (raw: string | undefined) =>
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

  collected.push(...splitList(process.env.GEMINI_API_KEY));
  collected.push(...splitList(process.env.GEMINI_API_KEYS));
  for (let i = 2; i <= 10; i += 1) {
    const v = process.env[`GEMINI_API_KEY_${i}`];
    if (v && v.trim().length > 0) collected.push(v.trim());
  }

  // Dedupe, preserving order.
  const seen = new Set<string>();
  return collected.filter((k) => (seen.has(k) ? false : (seen.add(k), true)));
}

const clientCache = new Map<string, GoogleGenAI>();
function getClientFor(apiKey: string): GoogleGenAI {
  let c = clientCache.get(apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey });
    clientCache.set(apiKey, c);
  }
  return c;
}

// Keep trying from the last-known-good key on subsequent calls so we don't
// burn a round-trip on a key we already know is exhausted.
let lastWorkingIndex = 0;

function isRateLimitError(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string } | null;
  if (!e) return false;
  if (e.status === 429 || e.code === 429) return true;
  const msg = (e.message ?? '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate limit') ||
    msg.includes('quota')
  );
}

async function generateJsonWithFailover(opts: {
  prompt: string | Content[];
  systemInstruction: string;
  schema?: Schema;
  temperature?: number;
  tools?: Tool[];
}): Promise<unknown> {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env.local and to the Vercel project env.');
  }

  // URL Context tool is incompatible with responseSchema/responseMimeType in
  // current Gemini — passing both yields a 400. When tools are present we
  // skip JSON mode and parse the JSON out of free text ourselves.
  const useStructuredOutput = !opts.tools || opts.tools.length === 0;

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const idx = (lastWorkingIndex + attempt) % keys.length;
    const key = keys[idx];
    try {
      const result = await getClientFor(key).models.generateContent({
        model: MODEL_ID,
        contents: opts.prompt,
        config: {
          systemInstruction: opts.systemInstruction,
          ...(useStructuredOutput
            ? {
                responseMimeType: 'application/json',
                ...(opts.schema ? { responseSchema: opts.schema } : {}),
              }
            : {}),
          ...(opts.tools ? { tools: opts.tools } : {}),
          temperature: opts.temperature ?? 0.2,
        },
      });
      lastWorkingIndex = idx;
      const text = result.text;
      if (!text) throw new Error('Gemini returned an empty response.');
      try {
        return useStructuredOutput ? JSON.parse(text) : extractJson(text);
      } catch {
        throw new Error('Gemini returned non-JSON output despite JSON mode.');
      }
    } catch (err) {
      lastErr = err;
      if (!isRateLimitError(err)) throw err;
      // else fall through to the next key
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `All ${keys.length} Gemini API key${keys.length === 1 ? '' : 's'} are rate-limited. Last error: ${detail}`,
  );
}

// When tools are enabled we can't use JSON mode, so we ask the model to
// output JSON inside ```json fences and pull it out here.
function extractJson(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  // Find the first { or [ and the last } or ] — handles preamble/postscript.
  const start = Math.min(
    ...['{', '['].map((c) => {
      const i = candidate.indexOf(c);
      return i === -1 ? Infinity : i;
    }),
  );
  const end = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'));
  if (!Number.isFinite(start) || end <= start) {
    throw new Error('No JSON object found in response.');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function structureMeetingTranscript(
  input: MeetingTranscriptInput,
): Promise<StructuredMeetingOutput> {
  const parsed = await generateJsonWithFailover({
    prompt: buildPrompt(input),
    systemInstruction: SYSTEM_INSTRUCTION,
    schema: STRUCTURED_MEETING_SCHEMA,
  });
  return normaliseStructuredMeeting(parsed);
}

// ──────────────────────────────────────────────────────────────────────────
// Coverage sentiment scoring.
//
// Given a piece of media coverage (headline, publication, optional notes),
// classify the sentiment toward the client and extract a couple of tone tags.

export type CoverageScoreInput = {
  client_name: string;
  publication_name: string;
  headline: string;
  reporter_name?: string | null;
  coverage_type: 'online' | 'print' | 'broadcast' | 'social';
  url?: string | null;
  notes?: string | null;
};

export type CoverageScoreOutput = {
  sentiment: 'positive' | 'neutral' | 'negative';
  tone_tags: string[];
  rationale: string;
};

const COVERAGE_SCORE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    sentiment: {
      type: Type.STRING,
      description:
        'Overall sentiment of this piece of coverage toward the client. Use "neutral" for routine factual reporting, "positive" only when the framing actively benefits the client, and "negative" only when the framing actively harms.',
      enum: ['positive', 'neutral', 'negative'],
    },
    tone_tags: {
      type: Type.ARRAY,
      description:
        'One to three short lower-case tags describing the tone or angle (e.g. "factual", "promotional", "critical", "milestone", "speculative"). Empty array if uncertain.',
      items: { type: Type.STRING },
    },
    rationale: {
      type: Type.STRING,
      description:
        'One short sentence explaining the chosen sentiment, citing the headline phrasing.',
    },
  },
  required: ['sentiment', 'tone_tags', 'rationale'],
  propertyOrdering: ['sentiment', 'tone_tags', 'rationale'],
};

const COVERAGE_SYSTEM_INSTRUCTION = `You score Malaysian/SEA business news coverage for an investor relations firm.
The client is a listed company on Bursa Malaysia. Sentiment is from THE CLIENT'S perspective:
- "positive" only when the article frames the client favourably (wins, growth, awards, reassuring guidance).
- "negative" only when the article frames the client unfavourably (downgrades, controversy, missed targets, lawsuits).
- "neutral" for factual / routine / mixed coverage. When in doubt, choose neutral.
Don't infer from publication name alone; rely on the headline and any notes provided.`;

export async function scoreCoverageSentiment(
  input: CoverageScoreInput,
): Promise<CoverageScoreOutput> {
  const meta: string[] = [];
  meta.push(`Client: ${input.client_name}`);
  meta.push(`Publication: ${input.publication_name}`);
  if (input.reporter_name) meta.push(`Reporter: ${input.reporter_name}`);
  meta.push(`Coverage type: ${input.coverage_type}`);
  if (input.url) meta.push(`URL: ${input.url}`);

  const body = `${meta.join('\n')}\n\nHeadline: ${input.headline}${
    input.notes ? `\n\nAnalyst notes:\n${input.notes}` : ''
  }`;

  const parsed = await generateJsonWithFailover({
    prompt: body,
    systemInstruction: COVERAGE_SYSTEM_INSTRUCTION,
    schema: COVERAGE_SCORE_SCHEMA,
    temperature: 0.1,
  });

  return normaliseCoverageScore(parsed);
}

function normaliseCoverageScore(raw: unknown): CoverageScoreOutput {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const sRaw = typeof obj.sentiment === 'string' ? obj.sentiment.trim().toLowerCase() : '';
  const sentiment: CoverageScoreOutput['sentiment'] =
    sRaw === 'positive' || sRaw === 'negative' ? sRaw : 'neutral';

  const tone_tags = Array.isArray(obj.tone_tags)
    ? obj.tone_tags
        .map((v) => String(v).trim().toLowerCase())
        .filter((v) => v.length > 0 && v.length <= 32)
        .slice(0, 3)
    : [];

  const rationale = typeof obj.rationale === 'string' ? obj.rationale.trim().slice(0, 280) : '';

  return { sentiment, tone_tags, rationale };
}

// ──────────────────────────────────────────────────────────────────────────
// Coverage PR Value calculation.
//
// Replicates the operator's existing workflow: paste a URL or upload a PDF
// to Gemini and ask for an estimated PR value. The model reads the article
// (URL Context tool for links, multimodal inlineData for PDFs/images) and
// returns a single PRV figure with a one-sentence rationale.

export type PrValueSource =
  | { kind: 'url'; url: string }
  | { kind: 'inline'; mimeType: string; base64Data: string };

export type PrValueInput = {
  client_name: string;
  publication_name: string;
  headline: string;
  coverage_type: 'online' | 'print' | 'broadcast' | 'social';
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  default_currency: string; // e.g. "MYR"
  source: PrValueSource;
};

export type PrValueOutput = {
  prv_value: number;
  currency: string;
  rationale: string;
};

const PR_VALUE_SYSTEM_INSTRUCTION = `You estimate PR Value (PRV) for media coverage of Bursa Malaysia listed companies, on behalf of an investor relations / public relations firm.
You will be given the actual article — either as a URL (read it via your URL context tool) or as an attached PDF / image clipping. Read it before estimating.

When estimating PRV, weigh:
- Publication tier (e.g. The Edge, Nikkei Asia, NST Business, FMT, Bursa Marketplace, sector blogs).
- Article prominence (front page / lead vs short snippet, length, presence of photos/quotes).
- Sentiment toward the client (positive amplifies, negative discounts heavily).
- Reach / audience profile (institutional readers, retail readers, regional spread).

Be a sober, conservative estimator. Typical Malaysian business news PRV ranges:
- Short factual mention in mid-tier outlet: RM 3,000 – RM 10,000.
- Solid feature in top-tier business pub: RM 15,000 – RM 50,000.
- Front-page / lead feature with strong positive framing in top-tier pub: RM 50,000 – RM 200,000.
- Negative coverage: heavily discounted or near zero PRV (the value to the client is negative in reality, but PRV is reported as the unmitigated coverage value, then sentiment is the modifier).

Currency defaults to MYR unless the article is published in a non-Malaysian outlet, in which case use the local currency.

Respond with ONLY a JSON object inside a \`\`\`json fenced block. The object must have:
  prv_value (number, no currency symbol or commas),
  currency (3-letter ISO code),
  rationale (one short sentence).`;

const PR_VALUE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    prv_value: {
      type: Type.NUMBER,
      description: 'Estimated PR value as a plain number, no currency symbol.',
    },
    currency: {
      type: Type.STRING,
      description: '3-letter ISO currency code, default MYR.',
    },
    rationale: {
      type: Type.STRING,
      description: 'One short sentence justifying the figure.',
    },
  },
  required: ['prv_value', 'currency', 'rationale'],
  propertyOrdering: ['prv_value', 'currency', 'rationale'],
};

export async function calculateCoveragePrValue(
  input: PrValueInput,
): Promise<PrValueOutput> {
  const meta: string[] = [];
  meta.push(`Client: ${input.client_name}`);
  meta.push(`Publication: ${input.publication_name}`);
  meta.push(`Coverage type: ${input.coverage_type}`);
  meta.push(`Headline: ${input.headline}`);
  if (input.sentiment) meta.push(`Recorded sentiment: ${input.sentiment}`);
  meta.push(`Default currency: ${input.default_currency}`);

  const textPrompt = `${meta.join(
    '\n',
  )}\n\nEstimate the PR value of the article${
    input.source.kind === 'url'
      ? ` at the URL below. Use your URL context tool to fetch the article first.\n\n${input.source.url}`
      : ' provided as an attachment below.'
  }`;

  // URL → URL Context tool. PDF/image → multimodal inlineData.
  if (input.source.kind === 'url') {
    const parsed = await generateJsonWithFailover({
      prompt: textPrompt,
      systemInstruction: PR_VALUE_SYSTEM_INSTRUCTION,
      tools: [{ urlContext: {} }],
      temperature: 0.2,
    });
    return normalisePrValue(parsed, input.default_currency);
  }

  const parsed = await generateJsonWithFailover({
    prompt: [
      {
        role: 'user',
        parts: [
          { text: textPrompt },
          {
            inlineData: {
              mimeType: input.source.mimeType,
              data: input.source.base64Data,
            },
          },
        ],
      },
    ],
    systemInstruction: PR_VALUE_SYSTEM_INSTRUCTION,
    schema: PR_VALUE_SCHEMA,
    temperature: 0.2,
  });
  return normalisePrValue(parsed, input.default_currency);
}

function normalisePrValue(raw: unknown, defaultCurrency: string): PrValueOutput {
  const obj = (raw ?? {}) as Record<string, unknown>;

  let prv_value = 0;
  if (typeof obj.prv_value === 'number' && Number.isFinite(obj.prv_value)) {
    prv_value = obj.prv_value;
  } else if (typeof obj.prv_value === 'string') {
    const cleaned = obj.prv_value.replace(/[,_\s]/g, '');
    const n = Number.parseFloat(cleaned);
    if (Number.isFinite(n)) prv_value = n;
  }
  if (prv_value < 0) prv_value = 0;
  // Round to 2dp for display sanity.
  prv_value = Math.round(prv_value * 100) / 100;

  const currencyRaw = typeof obj.currency === 'string' ? obj.currency.trim().toUpperCase() : '';
  const currency = /^[A-Z]{3}$/.test(currencyRaw) ? currencyRaw : defaultCurrency;

  const rationale =
    typeof obj.rationale === 'string' ? obj.rationale.trim().slice(0, 280) : '';

  return { prv_value, currency, rationale };
}

function normaliseStructuredMeeting(raw: unknown): StructuredMeetingOutput {
  const obj = (raw ?? {}) as Record<string, unknown>;

  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : '';
  const agenda_items = Array.isArray(obj.agenda_items)
    ? obj.agenda_items.map((v) => String(v).trim()).filter((v) => v.length > 0)
    : [];

  const rawActions = Array.isArray(obj.action_items) ? obj.action_items : [];
  const action_items = rawActions
    .map((row) => {
      const r = (row ?? {}) as Record<string, unknown>;
      const item = typeof r.item === 'string' ? r.item.trim() : '';
      const picRaw = typeof r.pic_name === 'string' ? r.pic_name.trim() : '';
      const dueRaw = typeof r.due_date === 'string' ? r.due_date.trim() : '';
      return {
        item,
        pic_name: picRaw.length > 0 ? picRaw : null,
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null,
      };
    })
    .filter((row) => row.item.length > 0);

  const sentimentRaw = typeof obj.sentiment === 'string' ? obj.sentiment.trim().toLowerCase() : '';
  const sentiment =
    sentimentRaw === 'positive' || sentimentRaw === 'neutral' || sentimentRaw === 'negative'
      ? sentimentRaw
      : null;

  return { summary, agenda_items, action_items, sentiment };
}
