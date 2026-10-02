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
> & { readonly error: { readonly code: number } | null };

export function japaneseCueMp3Path(lessonId: string, phraseIndex: number): string {
  return `diagnostics/japanese-cues/${lessonId}/phrase-${String(phraseIndex + 1).padStart(3, '0')}.mp3`;
}

// A dedicated element keeps the English player and Media Session policy intact.
// Only ended resolves playback normally; play() fulfillment is not completion.
export function createJapaneseMp3Player(
  createAudio: () => CueAudio,
  sample: () => { visibility: string; time: number },
  update: () => void,
) {
  let audio: CueAudio | null = null;
  let cancel: (() => void) | null = null;
  let identity: CueIdentity | null = null;
  let events: string[] = [];
  let requested = false;
  let started = false;
  let ended = false;
  let errorValue = 'none';

  function record(kind: string): void {
    try {
      const { visibility, time } = sample();
      events.push(`japanese-mp3 ${kind}(${visibility}) @${time.toFixed(1)}`);
      events = events.slice(-12);
      update();
    } catch {
      // Diagnostics must not affect playback.
    }
  }

  return {
    play(context: CueIdentity, baseUrl: string): Promise<void> {
      cancel?.();
      identity = { ...context };
      events = [];
      requested = true;
      started = false;
      ended = false;
      errorValue = 'none';
      record('request');

      return new Promise((resolve, reject) => {
        let settled = false;
        let element: CueAudio | null = null;
        const cleanup = (): void => {
          element?.removeEventListener('playing', handlePlaying);
          element?.removeEventListener('ended', handleEnded);
          element?.removeEventListener('error', handleError);
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
        const fail = (value: string): void => {
          if (settled) return;
          settled = true;
          errorValue = value;
          cleanup();
          element?.pause();
          record('error');
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
          fail(`media-error:${element?.error?.code ?? 'unknown'}`);
        };

        try {
          audio ??= createAudio();
          element = audio;
          cancel = stop;
          element.loop = false;
          element.addEventListener('playing', handlePlaying);
          element.addEventListener('ended', handleEnded);
          element.addEventListener('error', handleError);
          element.src = `${baseUrl}${japaneseCueMp3Path(context.lessonId, context.phraseIndex)}`;
          void element.play().catch((error: unknown) => {
            fail(error instanceof Error ? error.name : 'play-rejected');
          });
        } catch (error) {
          fail(error instanceof Error ? error.name : 'play-threw');
        }
      });
    },
    cancel(): void { cancel?.(); },
    lines(): string[] {
      return [
        `Japanese MP3 phrase ID: ${identity ? `${identity.lessonId}:${identity.phraseIndex}` : 'none'}`,
        `Japanese MP3 queue index: ${identity?.queueIndex ?? 'n/a'} (0-based)`,
        `Japanese MP3 play requested: ${requested ? 'yes' : 'no'}`,
        `Japanese MP3 play started: ${started ? 'yes' : 'no'}`,
        `Japanese MP3 ended: ${ended ? 'yes' : 'no'}`,
        `Japanese MP3 error: ${errorValue}`,
        'Japanese MP3 events (performance ms):',
        ...events,
      ];
    },
  };
}
