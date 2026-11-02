/** A post's id, as X numbers them. */
const newId = () => String(2117000000000000000n + BigInt(Math.floor(Math.random() * 1e9)));

/** A post's author line, shaped like X's: name and handle linking to the account, then the post's time. */
const authorLine = (name: string, handle: string, id: string) =>
  `<div data-testid="Tweet-User-Avatar"><div data-testid="UserAvatar-Container-${handle}"><a href="/${handle}" role="link" tabindex="-1"></a></div></div>` +
  `<div data-testid="User-Name"><div><a href="/${handle}" role="link"><div dir="ltr"><span>${name}</span></div></a></div>` +
  `<div><a href="/${handle}" role="link" tabindex="-1"><div dir="ltr"><span>@${handle}</span></div></a>` +
  `<a href="/${handle}/status/${id}" dir="ltr" role="link"><time datetime="2026-11-01T12:00:00.000Z">2h</time></a></div></div>`;

/** A quoted post, shaped like X's: its author named only by text and picture, with no links. */
const quotedPost = (text: string, handle: string) =>
  `<div tabindex="0" role="link"><div data-testid="Tweet-User-Avatar"><div data-testid="UserAvatar-Container-${handle}"></div></div>` +
  `<div data-testid="User-Name"><div dir="ltr"><span>${handle}</span></div><div dir="ltr"><span>@${handle}</span></div></div>` +
  `<div dir="auto" lang="en" data-testid="tweetText"><span>${text}</span></div></div>`;

/**
 * A hand-written post, shaped like X's signed-in markup: who reposted it, its
 * author line, its text, and optionally a quoted post.
 */
export function xPost(
  text: string,
  {
    author = 'someone',
    name = author,
    reposter,
    quoted,
  }: { author?: string; name?: string; reposter?: string; quoted?: { text: string; author: string } } = {},
): Element {
  const post = document.createElement('article');
  post.setAttribute('role', 'article');
  post.setAttribute('data-testid', 'tweet');
  post.innerHTML = `
    ${reposter ? `<div><a href="/${reposter}" dir="ltr" role="link"><span data-testid="socialContext"><span dir="ltr"><span>${reposter}</span></span> reposted</span></a></div>` : ''}
    ${authorLine(name, author, newId())}
    <div dir="auto" lang="en" data-testid="tweetText"><span>${text}</span></div>
    ${quoted ? quotedPost(quoted.text, quoted.author) : ''}
    <div role="group"><button data-testid="reply" aria-label="Reply"></button><button data-testid="like" aria-label="Like"></button></div>`;
  return post;
}

/** A hand-written trend, shaped like X's: its category, its name and how many posts it has. */
export function xTrend(name: string, category = 'Gaming · Trending'): Element {
  const trend = document.createElement('div');
  trend.setAttribute('role', 'link');
  trend.setAttribute('tabindex', '0');
  trend.setAttribute('data-testid', 'trend');
  trend.innerHTML = `<div><div dir="ltr"><span>${category}</span></div><div dir="ltr"><span>${name}</span></div><div dir="ltr"><span>12.3K posts</span></div></div>`;
  return trend;
}
