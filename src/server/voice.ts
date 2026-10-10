import type { Artifact } from '../core/contracts.js';

/**
 * Push-to-talk support. The phone records the glasses microphone only while the wearer holds the
 * temple, then posts raw 16 kHz mono signed 16-bit PCM here. Audio is transcribed and dropped; it is
 * never stored. Short phrases control the display; anything else becomes a message for the agent.
 */
export const VOICE = Object.freeze({ sampleRate: 16000, maxBytes: 16000 * 2 * 30, maxText: 500 });
export type Transcriber = (pcm: Buffer) => Promise<string>;

export function pcmToWav(pcm: Buffer, sampleRate = VOICE.sampleRate): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Gemini speech-to-text. Returns '' for silence. */
export function geminiTranscriber(apiKey: string, model = 'gemini-3.8-flash', fetchImpl: typeof fetch = fetch): Transcriber {
  return async pcm => {
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [
        { inline_data: { mime_type: 'audio/wav', data: pcmToWav(pcm).toString('base64') } },
        { text: 'Transcribe this speech exactly as spoken. Reply with only the words, no quotes or notes. If there is no speech, reply with nothing.' },
      ] }] }),
    });
    if (!response.ok) throw new Error(`Transcription failed (${response.status})`);
    const result = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return (result.candidates?.[0]?.content?.parts ?? []).map(part => part.text ?? '').join('').replace(/\s+/gu, ' ').trim().slice(0, VOICE.maxText);
  };
}

export type VoiceAction =
  | { kind: 'input'; type: 'next' | 'previous' | 'select' }
  | { kind: 'choose'; index: number }
  | { kind: 'clear' }
  | { kind: 'message' };
const NUMBERS: Record<string, number> = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4, fourth: 4, five: 5, fifth: 5, six: 6, sixth: 6, seven: 7, seventh: 7, eight: 8, eighth: 8, nine: 9, ninth: 9 };

/** Maps a short utterance to a display command. Longer speech is always a message. */
export function parseVoice(text: string, active: Artifact | undefined): VoiceAction {
  const words = text.toLowerCase().replace(/[^a-z0-9 ]+/gu, ' ').trim().split(/\s+/u).filter(Boolean);
  if (!words.length || words.length > 5) return { kind: 'message' };
  const phrase = words.join(' ');
  if (active?.template === 'choices') {
    const options = active.data.options.map(option => option.toLowerCase().replace(/[^a-z0-9 ]+/gu, ' ').trim());
    const spoken = words.find(word => /^\d$/u.test(word) || word in NUMBERS);
    const number = spoken === undefined ? undefined : Number(spoken) || NUMBERS[spoken];
    if (number && number <= options.length && /^(option|number|choose|pick|select)?\s?\w+$/u.test(phrase)) return { kind: 'choose', index: number - 1 };
    const rest = phrase.replace(/^(choose|pick|select|go with)\s+/u, '');
    const match = options.findIndex(option => option === rest);
    if (match >= 0) return { kind: 'choose', index: match };
  }
  if (/^(next|down|scroll down|go down|more)$/u.test(phrase)) return { kind: 'input', type: 'next' };
  if (/^(previous|back|up|scroll up|go up|go back)$/u.test(phrase)) return { kind: 'input', type: 'previous' };
  if (/^(open|close|toggle|switch|show answer|show artifact)$/u.test(phrase)) return { kind: 'input', type: 'select' };
  if (/^(clear|clear display|clear screen|hide)$/u.test(phrase)) return { kind: 'clear' };
  return { kind: 'message' };
}
