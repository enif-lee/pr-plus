import React from 'react';

export function CommentCard({ author, body }: { author: string; body: string }) {
  return (
    <article className="demo-comment">
      <strong>{author}</strong>
      <p>{body}</p>
    </article>
  );
}
