/** Videos and sounds Blackout paused, so it can play them again once they are allowed. */
const heldByBlackout = new WeakSet<HTMLMediaElement>();

/** Pauses `media` if it is playing, remembering to play it again later. */
export function holdMedia(media: HTMLMediaElement): void {
  if (media.paused) return;
  heldByBlackout.add(media);
  media.pause();
}

export function holdMediaIn(scope: ParentNode): void {
  for (const media of scope.querySelectorAll<HTMLMediaElement>('video, audio')) holdMedia(media);
}

/** Plays again what Blackout paused under `scope`, where `mayPlay` now allows it. */
export function releaseMediaIn(scope: ParentNode, mayPlay: (media: HTMLMediaElement) => boolean): void {
  for (const media of scope.querySelectorAll<HTMLMediaElement>('video, audio')) {
    if (!heldByBlackout.has(media) || !mayPlay(media)) continue;
    heldByBlackout.delete(media);
    // The browser may refuse to play without a click; the site's own controls still work.
    media.play().catch(() => {});
  }
}
