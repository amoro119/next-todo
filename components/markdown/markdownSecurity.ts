import DOMPurify from 'dompurify';
import { Marked, type RendererObject } from 'marked';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

export function isSafeMarkdownUrl(value: string): boolean {
  const normalized = value.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!normalized) return false;
  if (/^(#|\/(?!\/)|\.{1,2}\/)/.test(normalized)) return true;

  try {
    const parsed = new URL(normalized, 'https://local.invalid');
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const renderer = {
  html(value: string | { text?: string }) {
    const source = typeof value === 'string' ? value : (value.text ?? '');
    return `<p>${escapeHtml(source)}</p>`;
  },
  image(
    hrefOrToken: string | { text?: string },
    _title?: string | null,
    legacyText?: string,
  ) {
    const text = typeof hrefOrToken === 'string'
      ? (legacyText ?? '')
      : (hrefOrToken.text ?? '');
    return text ? escapeHtml(text) : '';
  },
} as unknown as RendererObject;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer,
});

function mapOutsideFencedCode(
  markdown: string,
  transform: (line: string) => string,
): string {
  let fenceCharacter = '';
  let fenceLength = 0;

  return markdown.split('\n').map((line) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      const marker = fence[1];
      if (!fenceCharacter) {
        fenceCharacter = marker[0];
        fenceLength = marker.length;
      } else if (
        marker[0] === fenceCharacter
        && marker.length >= fenceLength
        && !fence[2].trim()
      ) {
        fenceCharacter = '';
        fenceLength = 0;
      }
      return line;
    }

    if (fenceCharacter) return line;

    return transform(line);
  }).join('\n');
}

export function normalizeTaskListMarkers(markdown: string): string {
  return mapOutsideFencedCode(markdown, (line) =>
    line.replace(
      /^(\s*(?:[-+*]|\d+[.)])\s+)\[\](?=\s|$)/,
      '$1[ ]',
    ),
  );
}

export function prepareTaskListMarkersForRendering(markdown: string): string {
  return mapOutsideFencedCode(normalizeTaskListMarkers(markdown), (line) =>
    line.replace(
      /^(\s*(?:[-+*]|\d+[.)])\s+\[[ xX]\])\s*$/,
      '$1 \u200B',
    ),
  );
}

function renderMarkdown(markdown: string, interactiveCheckboxes: boolean): string {
  const rendered = marked.parse(
    prepareTaskListMarkersForRendering(markdown),
    { async: false },
  ) as string;
  const sanitized = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'strong', 'em', 'del', 'a', 'blockquote',
      'pre', 'code', 'ul', 'ol', 'li', 'hr', 'br',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input',
    ],
    ALLOWED_ATTR: ['href', 'title', 'type', 'checked', 'disabled', 'class'],
    ALLOW_DATA_ATTR: false,
  });

  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  for (const anchor of document.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') ?? '';
    if (!isSafeMarkdownUrl(href)) {
      anchor.removeAttribute('href');
      continue;
    }
    if (/^https?:/i.test(href)) {
      anchor.setAttribute('target', '_blank');
      anchor.setAttribute('rel', 'noopener noreferrer');
    }
  }
  for (const input of document.querySelectorAll('input')) {
    if (input.getAttribute('type') !== 'checkbox') {
      input.remove();
      continue;
    }
    if (interactiveCheckboxes) {
      input.removeAttribute('disabled');
      input.setAttribute('aria-label', '切换清单状态');
    } else {
      input.setAttribute('disabled', '');
    }
  }

  return document.body.innerHTML.replaceAll('\u200B', '');
}

export function renderSafeMarkdown(markdown: string): string {
  return renderMarkdown(markdown, false);
}

export function renderEditableMarkdown(markdown: string): string {
  return renderMarkdown(markdown, true);
}

export function sanitizePlainText(value: string): string {
  const sanitized = DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  const document = new DOMParser().parseFromString(sanitized, 'text/html');
  return document.body.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
