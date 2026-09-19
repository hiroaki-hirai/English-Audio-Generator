import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createIdlePlaybackContext,
  dispatchMediaSessionAction,
  isMediaSessionActionAllowed,
  type MediaSessionPolicyState,
} from '../web/src/media-session.js';

const idleState: MediaSessionPolicyState = {
  runtimeActive: false,
  runtimeKind: 'none',
  audioPlayOwner: 'none',
  expectedPhraseEnd: null,
};

test('inactive runtime without ownership rejects Media Session play', () => {
  assert.equal(isMediaSessionActionAllowed(idleState, 'play'), false);
});

test('inactive runtime rejects stale Media Session ownership', () => {
  assert.equal(
    isMediaSessionActionAllowed(
      { ...idleState, audioPlayOwner: 'media-session' },
      'play',
    ),
    false,
  );
});

test('inactive lesson player and phrase tap allow Media Session actions', () => {
  for (const audioPlayOwner of ['lesson-player', 'phrase-tap'] as const) {
    assert.equal(
      isMediaSessionActionAllowed(
        { ...idleState, audioPlayOwner },
        'play',
      ),
      true,
    );
    assert.equal(
      isMediaSessionActionAllowed(
        { ...idleState, audioPlayOwner },
        'pause',
      ),
      true,
    );
  }
});

test('Active Recall English segment allows Media Session play and pause', () => {
  const state: MediaSessionPolicyState = {
    runtimeActive: true,
    runtimeKind: 'active-recall',
    audioPlayOwner: 'active-recall',
    expectedPhraseEnd: 12.5,
  };

  assert.equal(isMediaSessionActionAllowed(state, 'play'), true);
  assert.equal(isMediaSessionActionAllowed(state, 'pause'), true);
});

test('Active Recall Recall period rejects Media Session play', () => {
  assert.equal(
    isMediaSessionActionAllowed(
      {
        runtimeActive: true,
        runtimeKind: 'active-recall',
        audioPlayOwner: 'none',
        expectedPhraseEnd: null,
      },
      'play',
    ),
    false,
  );
});

test('Active Recall rejects wrong ownership', () => {
  assert.equal(
    isMediaSessionActionAllowed(
      {
        runtimeActive: true,
        runtimeKind: 'active-recall',
        audioPlayOwner: 'training',
        expectedPhraseEnd: 12.5,
      },
      'play',
    ),
    false,
  );
});

test('Continuous Training allows Media Session play and pause', () => {
  const state: MediaSessionPolicyState = {
    runtimeActive: true,
    runtimeKind: 'training',
    audioPlayOwner: 'training',
    expectedPhraseEnd: null,
  };

  assert.equal(isMediaSessionActionAllowed(state, 'play'), true);
  assert.equal(isMediaSessionActionAllowed(state, 'pause'), true);
});

test('normal Training English segment allows Media Session play and pause', () => {
  const state: MediaSessionPolicyState = {
    runtimeActive: true,
    runtimeKind: 'training',
    audioPlayOwner: 'training',
    expectedPhraseEnd: 8,
  };

  assert.equal(isMediaSessionActionAllowed(state, 'play'), true);
  assert.equal(isMediaSessionActionAllowed(state, 'pause'), true);
});

test('ended Training rejects stale training ownership', () => {
  assert.equal(
    isMediaSessionActionAllowed(
      { ...idleState, audioPlayOwner: 'training' },
      'play',
    ),
    false,
  );
});

test('runtime kind and owner mismatch rejects Media Session action', () => {
  assert.equal(
    isMediaSessionActionAllowed(
      {
        runtimeActive: true,
        runtimeKind: 'training',
        audioPlayOwner: 'active-recall',
        expectedPhraseEnd: 5,
      },
      'pause',
    ),
    false,
  );
});

test('rejected Media Session play has no playback or ownership side effect', () => {
  let playCalls = 0;
  let pauseCalls = 0;
  const state = { ...idleState };

  const handled = dispatchMediaSessionAction(state, 'play', {
    play: () => {
      playCalls += 1;
    },
    pause: () => {
      pauseCalls += 1;
    },
  });

  assert.equal(handled, false);
  assert.equal(playCalls, 0);
  assert.equal(pauseCalls, 0);
  assert.equal(state.audioPlayOwner, 'none');
});

test('allowed Media Session action invokes only its matching control', () => {
  let playCalls = 0;
  let pauseCalls = 0;
  const state: MediaSessionPolicyState = {
    ...idleState,
    audioPlayOwner: 'lesson-player',
  };

  assert.equal(
    dispatchMediaSessionAction(state, 'play', {
      play: () => {
        playCalls += 1;
      },
      pause: () => {
        pauseCalls += 1;
      },
    }),
    true,
  );

  assert.equal(playCalls, 1);
  assert.equal(pauseCalls, 0);
  assert.equal(state.audioPlayOwner, 'lesson-player');
});

test('runtime cleanup creates an idle playback context', () => {
  assert.deepEqual(createIdlePlaybackContext(), {
    audioPlayOwner: 'none',
    expectedPhraseEnd: null,
    pendingPlayTrigger: null,
  });
});
