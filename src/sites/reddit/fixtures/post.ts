/**
 * A hand-written feed post, shaped like Reddit's markup: the post's details in
 * attributes, its title, author and subreddit in the card, and optional flair and
 * body text.
 */
export function redditPost(
  title: string,
  { subreddit = 'r/gaming', author = 'someone', flair, body }: { subreddit?: string; author?: string; flair?: string; body?: string } = {},
): Element {
  const id = `t3_${Math.random().toString(36).slice(2, 9)}`;
  const permalink = `/${subreddit}/comments/${id.slice(3)}/post/`;
  const post = document.createElement('shreddit-post');
  post.setAttribute('id', id);
  post.setAttribute('permalink', permalink);
  post.setAttribute('post-title', title);
  post.setAttribute('subreddit-prefixed-name', subreddit);
  post.setAttribute('author', author);
  post.innerHTML = `
    <span slot="credit-bar">
      <a href="/${subreddit}/">${subreddit}</a>
      <a href="https://www.reddit.com/user/${author}/"><span>u/${author}</span></a>
    </span>
    <a slot="title" href="https://www.reddit.com${permalink}">${title}</a>
    ${flair ? `<shreddit-post-flair slot="post-flair"><a><span>${flair}</span></a></shreddit-post-flair>` : ''}
    ${body ? `<div slot="text-body"><p>${body}</p></div>` : ''}`;
  return post;
}

/** A hand-written comment, shaped like Reddit's: its author line, its text, and room for replies. */
export function redditComment(text: string, { author = 'someone' }: { author?: string } = {}): Element {
  const id = `t1_${Math.random().toString(36).slice(2, 9)}`;
  const comment = document.createElement('shreddit-comment');
  comment.setAttribute('author', author);
  comment.setAttribute('thingid', id);
  comment.innerHTML = `
    <details open>
      <summary><div slot="commentMeta"><a href="https://www.reddit.com/user/${author}/"><span>${author}</span></a></div></summary>
      <div><div id="${id}-comment-rtjson-content" slot="comment"><p>${text}</p></div></div>
      <div id="comment-children"></div>
    </details>`;
  return comment;
}
