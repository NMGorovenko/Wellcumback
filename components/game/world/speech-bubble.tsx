import type { RefObject } from 'react';

export type SpeechBubbleRef = RefObject<HTMLOutputElement | null>;

/** Dialogue follows the speaker in the scene; captions never depend on sound. */
export function SpeechBubble({
  bubbleRef,
  speaker,
  text,
  visible,
}: {
  bubbleRef: SpeechBubbleRef;
  speaker: string;
  text: string;
  visible: boolean;
}) {
  return (
    <output
      ref={bubbleRef}
      className="world-speech"
      aria-live="polite"
      hidden={!visible}
      style={{ visibility: 'hidden' }}
    >
      <strong>{speaker}</strong>
      <span className="speech-text">{text}</span>
      <i aria-hidden="true" />
    </output>
  );
}
