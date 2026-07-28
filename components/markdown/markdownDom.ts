import { isSafeMarkdownUrl } from './markdownSecurity';

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'FIELDSET',
  'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'HEADER', 'HR', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'UL',
]);

function textValue(node: Node): string {
  return (node.textContent ?? '').replaceAll('\u00a0', ' ');
}

function serializeInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').replaceAll('\u00a0', ' ');
  }
  if (!(node instanceof HTMLElement)) return '';

  const inner = () => Array.from(node.childNodes).map(serializeInlineNode).join('');

  switch (node.tagName) {
    case 'BR':
      return '\n';
    case 'STRONG':
    case 'B':
      return `**${inner()}**`;
    case 'EM':
    case 'I':
      return `_${inner()}_`;
    case 'DEL':
    case 'S':
    case 'STRIKE':
      return `~~${inner()}~~`;
    case 'CODE': {
      const content = textValue(node);
      const fence = content.includes('`') ? '``' : '`';
      return `${fence}${content}${fence}`;
    }
    case 'A': {
      const label = inner();
      const href = node.getAttribute('href') ?? '';
      return isSafeMarkdownUrl(href) ? `[${label}](${href})` : label;
    }
    case 'INPUT':
      return '';
    default:
      return inner();
  }
}

function serializeInlineChildren(element: Element, excludedTags = new Set<string>()): string {
  return Array.from(element.childNodes)
    .filter((node) => !(node instanceof HTMLElement && excludedTags.has(node.tagName)))
    .map((node) => {
      if (node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName)) {
        if (node.tagName === 'P' || node.tagName === 'DIV') {
          return serializeInlineChildren(node);
        }
        return serializeBlockNode(node).trim();
      }
      return serializeInlineNode(node);
    })
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function serializeList(element: HTMLElement, depth = 0): string {
  const ordered = element.tagName === 'OL';
  const items = Array.from(element.children).filter((child) => child.tagName === 'LI');

  return items.map((item, index) => {
    const li = item as HTMLElement;
    const checkbox = Array.from(li.children).find(
      (child) => child instanceof HTMLInputElement && child.type === 'checkbox',
    ) as HTMLInputElement | undefined;
    const nestedLists = Array.from(li.children).filter(
      (child) => child.tagName === 'UL' || child.tagName === 'OL',
    ) as HTMLElement[];
    const label = serializeInlineChildren(li, new Set(['UL', 'OL', 'INPUT']));
    const marker = ordered ? `${index + 1}.` : '-';
    const taskMarker = checkbox ? `[${checkbox.checked ? 'x' : ' '}] ` : '';
    const line = `${'  '.repeat(depth)}${marker} ${taskMarker}${label}`.trimEnd();
    const nested = nestedLists
      .map((list) => serializeList(list, depth + 1))
      .filter(Boolean)
      .join('\n');
    return nested ? `${line}\n${nested}` : line;
  }).join('\n');
}

function escapeTableCell(value: string): string {
  return value.replaceAll('|', '\\|').replace(/\s*\n\s*/g, '<br>');
}

function serializeTable(element: HTMLElement): string {
  const rows = Array.from(element.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
      escapeTableCell(serializeInlineChildren(cell)),
    ),
  );
  if (!rows.length) return '';

  const width = Math.max(...rows.map((row) => row.length), 1);
  const normalized = rows.map((row) => [
    ...row,
    ...Array.from({ length: width - row.length }, () => ''),
  ]);
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  return [
    line(normalized[0]),
    line(Array.from({ length: width }, () => '---')),
    ...normalized.slice(1).map(line),
  ].join('\n');
}

function serializeBlockquote(element: HTMLElement): string {
  const content = Array.from(element.childNodes)
    .map((node) => {
      if (node instanceof HTMLElement && BLOCK_TAGS.has(node.tagName)) {
        return serializeBlockNode(node).trim();
      }
      return serializeInlineNode(node);
    })
    .join('')
    .trim();
  return content.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n');
}

function serializeBlockNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').trim() ? `${node.nodeValue}\n\n` : '';
  }
  if (!(node instanceof HTMLElement)) return '';

  switch (node.tagName) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      return `${'#'.repeat(Number(node.tagName.slice(1)))} ${serializeInlineChildren(node)}\n\n`;
    case 'P':
    case 'DIV': {
      const hasBlockChildren = Array.from(node.children).some((child) => BLOCK_TAGS.has(child.tagName));
      if (hasBlockChildren) {
        return Array.from(node.childNodes).map(serializeBlockNode).join('');
      }
      return `${serializeInlineChildren(node)}\n\n`;
    }
    case 'UL':
    case 'OL':
      return `${serializeList(node)}\n\n`;
    case 'BLOCKQUOTE':
      return `${serializeBlockquote(node)}\n\n`;
    case 'PRE': {
      const code = node.querySelector('code');
      const language = code?.className.match(/language-([\w-]+)/)?.[1] ?? '';
      const content = textValue(code ?? node).replace(/\n$/, '');
      const fence = content.includes('```') ? '````' : '```';
      return `${fence}${language}\n${content}\n${fence}\n\n`;
    }
    case 'HR':
      return '---\n\n';
    case 'TABLE':
      return `${serializeTable(node)}\n\n`;
    case 'BR':
      return '\n';
    default:
      return `${serializeInlineChildren(node)}\n\n`;
  }
}

export function editableHtmlToMarkdown(root: HTMLElement): string {
  return Array.from(root.childNodes)
    .map(serializeBlockNode)
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
