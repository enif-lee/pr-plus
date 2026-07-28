import React from 'react';

export type FileNode = { path: string; additions: number; deletions: number };

export function FileTree({ files, active }: { files: FileNode[]; active?: string }) {
  return (
    <ul className="demo-file-tree">
      {files.map((f) => (
        <li key={f.path} data-active={f.path === active ? '1' : '0'}>
          <span>{f.path}</span>
          <span className="stats">+{f.additions} −{f.deletions}</span>
        </li>
      ))}
    </ul>
  );
}
