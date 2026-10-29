// Subreddit names, as a topic stores its own and as Reddit shows them.

import type { BlockedSource } from './state';

/**
 * A subreddit's name, as Reddit spells it, from "GTA6", "r/GTA6", "/r/GTA6/" or
 * its address; null when it isn't one.
 */
export function subredditName(typed: string | null | undefined): string | null {
  const name = (typed ?? '')
    .trim()
    .replace(/^(https?:\/\/)?(www\.|old\.|new\.)?reddit\.com/i, '')
    .replace(/^\/?r\//i, '')
    .replace(/\/.*$/, '');
  return /^[A-Za-z0-9_]{2,21}$/.test(name) ? name : null;
}

/** A subreddit as a source, as Blackout stores accounts: "r/" and the name in lowercase. */
export function subredditSource(typed: string | null | undefined): BlockedSource | null {
  const name = subredditName(typed);
  return name ? { site: 'reddit', account: `r/${name.toLowerCase()}`, name: `r/${name}` } : null;
}
