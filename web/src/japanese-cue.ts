import { diagnosticLesson, diagnosticJapanesePath, diagnosticCueCount } from './diagnostic-fixture.js';

export type JapaneseCueMode = 'speech-synthesis' | 'mp3-diagnostic';

export function getJapaneseCueMode(value?: string): JapaneseCueMode {
  return value === 'mp3-diagnostic' ? value : 'speech-synthesis';
}

export function playJapaneseCue(
  mode: JapaneseCueMode,
  speech: () => Promise<void>,
  mp3: () => Promise<void>,
): Promise<void> {
  return mode === 'mp3-diagnostic' ? mp3() : speech();
}

type CueIdentity = { lessonId: string; phraseIndex: number; queueIndex: number };
type CueAudio = Pick<HTMLAudioElement,
  'src' | 'loop' | 'play' | 'pause' | 'addEventListener' | 'removeEventListener'
> & { readonly error: { readonly code: number; readonly message?: string } | null };

export function japaneseCueMp3Path(lessonId: string, phraseIndex: number): string {
  if (lessonId === diagnosticLesson.id) return diagnosticJapanesePath(phraseIndex);
  return `diagnostics/japanese-cues/${lessonId}/phrase-${String(phraseIndex + 1).padStart(3, '0')}.mp3`;
}

// Describes the checked-in sample, not a claim about HTTP availability.
export function isBundledJapaneseCueMp3(lessonId: string, phraseIndex: number): boolean {
  if (lessonId === diagnosticLesson.id) return Number.isInteger(phraseIndex) && phraseIndex >= 0 && phraseIndex < diagnosticCueCount;
  return lessonId === 'basic-delivery' && Number.isInteger(phraseIndex)
    && phraseIndex >= 0 && phraseIndex < 3;
}

export async function probeJapaneseMp3Url(url: string, request: typeof fetch = fetch): Promise<string> {
  try {
    const response = await request(url, { method: 'HEAD', cache: 'no-store' });
    const classification = response.status === 404 ? 'not-found'
      : response.ok ? 'reachable (not a decode test)' : 'HTTP-failure';
    return `${classification}; HTTP ${response.status}; Content-Type: ${response.headers.get('content-type') ?? 'unknown'}`;
  } catch (error) {
    return `network-failure; ${error instanceof Error ? error.name : 'unknown'}`;
  }
}

// A dedicated element keeps the English player and Media Session policy intact.
// Only ended resolves playback normally; play() fulfillment is not completion.
export function createJapaneseMp3Player(
  createAudio: () => CueAudio,
  sample: () => { visibility: string; time: number },
  update: () => void,
  probe: (url: string) => Promise<string> = probeJapaneseMp3Url,
  observe: (kind: string) => void = () => {},
) {
  let audio: CueAudio | null = null;
  let cancel: (() => void) | null = null;
  let identity: CueIdentity | null = null;
  let events: string[] = [];
  let requested = false;
  let started = false;
  let ended = false;
  let errorValue = 'none';
  let resolvedPath = 'none';
  let resolvedUrl = 'none';
  let playRejection = 'none';
  let mediaErrorEvent = false;
  let mediaErrorCode: number | null = null;
  let mediaErrorMessage = 'none';
  let failureSource = 'none';
  let httpResult = 'not-checked (only after playback failure)';
  let requestId = 0;
  let detachErrorListener: (() => void) | null = null;

  function record(kind: string): void {
    try {
      const { visibility, time } = sample();
      events.push(`japanese-mp3 ${kind}(${visibility}) @${time.toFixed(1)}`);
      events = events.slice(-12);
      observe(`japanese-mp3 ${kind}`);
      update();
    } catch {
      // Diagnostics must not affect playback.
    }
  }

  return {
    play(context: CueIdentity, baseUrl: string): Promise<void> {
      cancel?.();
      detachErrorListener?.();
      detachErrorListener = null;
      const id = ++requestId;
      identity = { ...context };
      events = [];
      requested = true;
      started = false;
      ended = false;
      errorValue = 'none';
      resolvedPath = `${baseUrl}${japaneseCueMp3Path(context.lessonId, context.phraseIndex)}`;
      resolvedUrl = resolvedPath;
      playRejection = 'none';
      mediaErrorEvent = false;
      mediaErrorCode = null;
      mediaErrorMessage = 'none';
      failureSource = 'none';
      httpResult = 'not-checked (only after playback failure)';
      record('request');

      return new Promise((resolve, reject) => {
        let settled = false;
        let element: CueAudio | null = null;
        const cleanup = (keepErrorListener = false): void => {
          element?.removeEventListener('playing', handlePlaying);
          element?.removeEventListener('ended', handleEnded);
          if (!keepErrorListener) {
            detachErrorListener?.();
            detachErrorListener = null;
          }
          if (cancel === stop) cancel = null;
        };
        const stop = (): void => {
          if (settled) return;
          settled = true;
          cleanup();
          element?.pause();
          record('cancel');
          resolve();
        };
        const captureMediaError = (): void => {
          mediaErrorCode = element?.error?.code ?? null;
          mediaErrorMessage = element?.error?.message || 'none/empty';
        };
        const fail = (value: string, source: string): void => {
          if (settled) return;
          settled = true;
          errorValue = value;
          failureSource = source;
          captureMediaError();
          // The error event and play rejection can arrive in either order.
          // Keep one error observer until the next cue so neither is conflated.
          cleanup(true);
          element?.pause();
          httpResult = 'checking (separate HEAD after playback failure)';
          record('error');
          const failedPath = resolvedPath;
          // Never gate play() or recovery on this independent diagnostic request.
          void Promise.resolve().then(() => probe(failedPath)).then((result) => {
            if (id !== requestId) return;
            httpResult = result;
            record('http-check');
          }).catch(() => {
            if (id !== requestId) return;
            httpResult = 'probe-failed';
            record('http-check');
          });
          reject(new Error(`Japanese MP3 cue failed: ${value}`));
        };
        const handlePlaying = (): void => {
          started = true;
          record('play');
        };
        const handleEnded = (): void => {
          if (settled) return;
          settled = true;
          ended = true;
          cleanup();
          record('ended');
          resolve();
        };
        const handleError = (): void => {
          if (id !== requestId) return;
          mediaErrorEvent = true;
          captureMediaError();
          record('media-error');
          fail(`media-error:${element?.error?.code ?? 'unknown'}`, 'media-element-error');
        };

        try {
          audio ??= createAudio();
          element = audio;
          cancel = stop;
          element.loop = false;
          element.addEventListener('playing', handlePlaying);
          element.addEventListener('ended', handleEnded);
          element.addEventListener('error', handleError);
          detachErrorListener = () => element?.removeEventListener('error', handleError);
          element.src = resolvedPath;
          resolvedUrl = element.src;
          void element.play().catch((error: unknown) => {
            if (id !== requestId) return;
            playRejection = error instanceof Error ? `${error.name}: ${error.message}` : 'unknown';
            captureMediaError();
            record('play-rejected');
            fail(error instanceof Error ? error.name : 'play-rejected', 'play-rejection');
          });
        } catch (error) {
          fail(error instanceof Error ? error.name : 'play-threw', 'synchronous-exception');
        }
      });
    },
    cancel(): void { cancel?.(); },
    lines(): string[] {
      return [
        `Japanese MP3 phrase ID: ${identity ? `${identity.lessonId}:${identity.phraseIndex}` : 'none'}`,
        `Japanese MP3 queue index: ${identity?.queueIndex ?? 'n/a'} (0-based)`,
        `Japanese MP3 resolved path: ${resolvedPath}`,
        `Japanese MP3 resolved URL: ${resolvedUrl}`,
        `Japanese MP3 bundled sample: ${identity && isBundledJapaneseCueMp3(identity.lessonId, identity.phraseIndex) ? 'yes' : 'no'}`,
        `Japanese MP3 play requested: ${requested ? 'yes' : 'no'}`,
        `Japanese MP3 play started: ${started ? 'yes' : 'no'}`,
        `Japanese MP3 ended: ${ended ? 'yes' : 'no'}`,
        `Japanese MP3 error: ${errorValue}`,
        `Japanese MP3 first failure source: ${failureSource}`,
        `Japanese MP3 play() rejection: ${playRejection}`,
        `Japanese MP3 media error event: ${mediaErrorEvent ? 'yes' : 'no'}`,
        `Japanese MP3 audio.error.code: ${mediaErrorCode ?? 'none'}`,
        `Japanese MP3 audio.error.message: ${mediaErrorMessage}`,
        `Japanese MP3 HTTP check: ${httpResult}`,
        'Japanese MP3 events (performance ms):',
        ...events,
      ];
    },
  };
}
