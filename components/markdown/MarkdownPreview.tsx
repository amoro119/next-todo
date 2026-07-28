"use client";

import { useMemo } from 'react';

import { renderSafeMarkdown } from './markdownSecurity';

interface MarkdownPreviewProps {
  markdown: string;
  emptyMessage?: string;
  className?: string;
}

export default function MarkdownPreview({
  markdown,
  emptyMessage = '暂无备注',
  className = '',
}: MarkdownPreviewProps) {
  const html = useMemo(
    () => (markdown.trim() ? renderSafeMarkdown(markdown) : ''),
    [markdown],
  );

  if (!html) {
    return (
      <div className={`markdown-preview markdown-preview--empty ${className}`.trim()}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={`markdown-preview ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
