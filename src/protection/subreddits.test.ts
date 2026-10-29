import { describe, expect, it } from 'vitest';
import { subredditName, subredditSource } from './subreddits';

describe('subreddit names', () => {
  it.each(['GTA6', 'r/GTA6', '/r/GTA6/', ' r/GTA6 ', 'https://www.reddit.com/r/GTA6/', 'old.reddit.com/r/GTA6/top/'])(
    'reads %j as r/GTA6',
    (typed) => {
      expect(subredditName(typed)).toBe('GTA6');
      expect(subredditSource(typed)).toEqual({ site: 'reddit', account: 'r/gta6', name: 'r/GTA6' });
    },
  );

  it.each(['', 'r/', 'not a subreddit', 'r/a', null, undefined])('reads %j as no subreddit', (typed) => {
    expect(subredditName(typed)).toBeNull();
  });
});
