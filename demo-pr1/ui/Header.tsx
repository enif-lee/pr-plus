import React from 'react';

export function DemoHeader({ title }: { title: string }) {
  return (
    <header className="demo-header">
      <h1>{title}</h1>
      <nav>
        <a href="#conversation">Conversation</a>
        <a href="#diff">Diff</a>
      </nav>
    </header>
  );
}
