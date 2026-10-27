/**
 * A hand-written home-feed tile, shaped like YouTube's lockup markup. Like the
 * real page, it has no whitespace between elements.
 */
export function homeFeedTile(title: string, channel = 'Some Channel'): Element {
  const el = (tag: string, ...children: (Node | string)[]) => {
    const element = document.createElement(tag);
    element.append(...children);
    return element;
  };
  const link = el('a', el('span', title));
  link.setAttribute('href', `/watch?v=${encodeURIComponent(title)}&pp=tracking`);
  const heading = el('h3', link);
  heading.title = title;
  return el(
    'ytd-rich-item-renderer',
    el(
      'div',
      el('yt-lockup-view-model', heading, el('yt-content-metadata-view-model', el('a', channel))),
    ),
  );
}
