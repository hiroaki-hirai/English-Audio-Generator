type SpeechEvent = 'request' | 'speak' | 'onstart' | 'onend' | 'onerror';

type SpeechSnapshot = {
  visibility: string;
  time: number;
  speaking: boolean;
  pending: boolean;
  paused: boolean;
};

type SpeechRequest = {
  phraseId: string;
  queueIndex: number;
  textLength: number;
};

// This observer owns only diagnostic data, never playback or session state.
export function createSpeechDiagnostic(sample: () => SpeechSnapshot) {
  let request: SpeechRequest | null = null;
  let requestId = 0;
  let errorValue = 'none';
  let events: Array<{ kind: SpeechEvent; snapshot: SpeechSnapshot }> = [];

  function record(id: number, kind: SpeechEvent, error?: string): void {
    try {
      if (id !== requestId) return;
      if (kind === 'onerror') errorValue = error ?? 'unknown';
      events.push({ kind, snapshot: sample() });
      // Bound memory even if a browser unexpectedly repeats callbacks.
      events = events.slice(-12);
    } catch {
      // Observability must never interrupt speech.
    }
  }

  return {
    request(context: SpeechRequest): number {
      requestId += 1;
      request = { ...context };
      events = [];
      errorValue = 'none';
      record(requestId, 'request');
      return requestId;
    },
    record,
    lines(): string[] {
      try {
        const current = sample();
        const lines = [
          `speech request: ${request ? `phrase ${request.queueIndex + 1} (request #${requestId})` : 'none'}`,
          `speech phrase ID: ${request?.phraseId ?? 'n/a'}`,
          `speech queue index: ${request?.queueIndex ?? 'n/a'} (0-based)`,
          `speech cue length: ${request?.textLength ?? 'n/a'}`,
        ];
        for (const kind of ['request', 'speak', 'onstart', 'onend', 'onerror'] as const) {
          const event = events.find((entry) => entry.kind === kind);
          if (kind !== 'request') {
            lines.push(`speech ${kind === 'speak' ? 'speak called' : kind}: ${event ? 'yes' : 'no'}`);
          }
          lines.push(`visibility at ${kind}: ${event?.snapshot.visibility ?? 'n/a'}`);
        }
        lines.push(
          `speech error value: ${errorValue}`,
          `speechSynthesis speaking: ${current.speaking}`,
          `speechSynthesis pending: ${current.pending}`,
          `speechSynthesis paused: ${current.paused}`,
          'speech events (performance ms; speaking/pending/paused):',
          ...events.map(({ kind, snapshot: s }) =>
            `${kind}(${s.visibility}) @${s.time.toFixed(1)} [${s.speaking}/${s.pending}/${s.paused}]`,
          ),
        );
        return lines;
      } catch {
        return ['speech diagnostic: unavailable'];
      }
    },
  };
}
