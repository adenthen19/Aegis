import { GoogleGenAI, Type, type Schema } from '@google/genai';

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

async function generateContentWithFailover(prompt: string) {
  const keys = getApiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env.local and to the Vercel project env.');
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < keys.length; attempt += 1) {
    const idx = (lastWorkingIndex + attempt) % keys.length;
    const key = keys[idx];
    try {
      const result = await getClientFor(key).models.generateContent({
        model: MODEL_ID,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: STRUCTURED_MEETING_SCHEMA,
          temperature: 0.2,
        },
      });
      lastWorkingIndex = idx;
      return result;
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

export async function structureMeetingTranscript(
  input: MeetingTranscriptInput,
): Promise<StructuredMeetingOutput> {
  const result = await generateContentWithFailover(buildPrompt(input));

  const text = result.text;
  if (!text) {
    throw new Error('Gemini returned an empty response.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Gemini returned non-JSON output despite JSON mode.');
  }

  return normaliseStructuredMeeting(parsed);
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
