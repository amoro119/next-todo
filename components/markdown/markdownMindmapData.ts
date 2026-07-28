import type { IPureNode } from 'markmap-common';

import { normalizeTaskListMarkers, sanitizePlainText } from './markdownSecurity';

const FENCED_CODE = /(^|\n)[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n[ \t]*\2(?=\n|$)/g;
const HTML_BLOCK = /<\/?[A-Za-z][^>\n]*>/g;
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const TABLE_DELIMITER = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;

export function prepareMindmapMarkdown(markdown: string): string {
  const withoutCode = normalizeTaskListMarkers(markdown).replace(FENCED_CODE, '\n');
  const withoutImages = withoutCode.replace(MARKDOWN_IMAGE, '$1');
  const withoutHtml = withoutImages.replace(HTML_BLOCK, '');
  const lines = withoutHtml.split('\n');
  const tableLines = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    if (!TABLE_DELIMITER.test(lines[index])) continue;
    tableLines.add(index);
    if (index > 0 && TABLE_ROW.test(lines[index - 1])) tableLines.add(index - 1);
    let cursor = index + 1;
    while (cursor < lines.length && TABLE_ROW.test(lines[cursor])) {
      tableLines.add(cursor);
      cursor += 1;
    }
  }

  return lines
    .filter((_, index) => !tableLines.has(index))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildMindmapMarkdown(markdown: string, rootLabel: string): string {
  const prepared = prepareMindmapMarkdown(markdown);
  const normalizedRoot = (rootLabel.trim() || '未命名任务').replace(/\s+/g, ' ');
  if (!prepared) {
    return [
      `# ${normalizedRoot}`,
      '## 示例结构',
      '- 添加一个标题',
      '  - 再添加子列表',
      '- [ ] 用清单表示步骤',
    ].join('\n');
  }

  const output = [`# ${normalizedRoot}`];
  const paragraph: string[] = [];
  let paragraphIndent = '';
  let currentHeadingDepth = 0;

  const flushParagraph = (beforeHeading = false) => {
    const text = paragraph.join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      if (beforeHeading) {
        output.push(`${'#'.repeat(Math.min(6, currentHeadingDepth + 2))} ${text}`);
      } else {
        output.push(`${paragraphIndent}- ${text}`);
      }
    }
    paragraph.length = 0;
    paragraphIndent = '';
  };

  for (const line of prepared.split('\n')) {
    const heading = line.match(/^\s*(#{1,6})\s+(.+)$/);
    const listItem = line.match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);

    if (heading) {
      flushParagraph(true);
      const depth = Math.min(6, heading[1].length + 1);
      output.push(`${'#'.repeat(depth)} ${heading[2].trim()}`);
      currentHeadingDepth = heading[1].length;
      continue;
    }

    if (listItem) {
      flushParagraph();
      output.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (!paragraph.length) {
      paragraphIndent = line.match(/^\s*/)?.[0] ?? '';
    }
    paragraph.push(line.trim());
  }
  flushParagraph();

  return output.join('\n');
}

export function sanitizeMindmapTree(root: IPureNode, rootLabel: string): IPureNode {
  const clean = (node: IPureNode): IPureNode => {
    const rawText = sanitizePlainText(node.content);
    const taskState = /^\s*\[([ xX])\]\s*/.exec(rawText);
    const plainText = rawText.replace(/^\s*\[[ xX]\]\s*/, '').trim();

    return {
      content: `${taskState ? (taskState[1].toLowerCase() === 'x' ? '☑ ' : '☐ ') : ''}${plainText || '未命名节点'}`,
      payload: node.payload ? { fold: node.payload.fold } : undefined,
      children: (node.children ?? []).map(clean),
    };
  };

  return {
    content: sanitizePlainText(rootLabel) || '未命名任务',
    children: (root.children ?? []).map(clean),
  };
}

export function mindmapOutlineText(root: IPureNode): string {
  const walk = (node: IPureNode, depth: number): string[] => [
    `${'  '.repeat(depth)}${node.content}`,
    ...(node.children ?? []).flatMap((child) => walk(child, depth + 1)),
  ];
  return walk(root, 0).join('\n');
}
