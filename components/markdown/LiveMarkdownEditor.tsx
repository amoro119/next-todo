"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { editableHtmlToMarkdown } from './markdownDom';
import {
  isSafeMarkdownUrl,
  renderEditableMarkdown,
} from './markdownSecurity';

interface LiveMarkdownEditorProps {
  value: string;
  recordKey: string;
  onChange: (markdown: string) => void;
  onError?: (error: Error) => void;
}

const BLOCK_SELECTOR = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre';

function setCaretInside(element: HTMLElement, atStart = true) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(atStart);
  selection.removeAllRanges();
  selection.addRange(range);
}

function setCaretAfter(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStartAfter(element);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function currentBlock(root: HTMLElement): HTMLElement | null {
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  if (!anchor || !root.contains(anchor)) return null;
  const element = anchor instanceof HTMLElement ? anchor : anchor.parentElement;
  return element?.closest<HTMLElement>(BLOCK_SELECTOR) ?? root;
}

function textBeforeCaret(block: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode) return '';
  const range = document.createRange();
  range.selectNodeContents(block);
  try {
    range.setEnd(selection.anchorNode, selection.anchorOffset);
  } catch {
    return '';
  }
  return range.toString();
}

function replaceBlock(
  root: HTMLElement,
  block: HTMLElement,
  replacement: HTMLElement,
  caretTarget = replacement,
) {
  if (block === root) {
    root.replaceChildren(replacement);
  } else {
    block.replaceWith(replacement);
  }
  setCaretInside(caretTarget);
}

function createEmptyBlock(tagName: string): HTMLElement {
  const element = document.createElement(tagName);
  element.append(document.createElement('br'));
  return element;
}

function createChecklistItem(checked: boolean): HTMLLIElement {
  const item = document.createElement('li');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.setAttribute('aria-label', '切换清单状态');
  item.append(checkbox, document.createElement('br'));
  return item;
}

function ensureBlockContent(element: HTMLElement) {
  if (!element.textContent && !element.querySelector('input,br')) {
    element.append(document.createElement('br'));
  }
}

function splitBlockAtCaret(block: HTMLElement, nextBlock: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.anchorNode || !block.contains(selection.anchorNode)) {
    return false;
  }

  const tailRange = document.createRange();
  tailRange.selectNodeContents(block);
  try {
    tailRange.setStart(selection.anchorNode, selection.anchorOffset);
  } catch {
    return false;
  }
  const tail = tailRange.extractContents();
  nextBlock.append(tail);
  ensureBlockContent(block);
  ensureBlockContent(nextBlock);
  block.after(nextBlock);
  setCaretInside(nextBlock);
  return true;
}

function insertParagraphAfterRoot(root: HTMLElement) {
  const current = document.createElement('p');
  current.append(...Array.from(root.childNodes));
  ensureBlockContent(current);
  const next = createEmptyBlock('p');
  root.append(current, next);
  setCaretInside(next);
}

function parseChecklistMarker(marker: string): boolean | null {
  if (marker === '[]' || marker === '[ ]') return false;
  if (/^\[[xX]\]$/.test(marker)) return true;
  return null;
}

function applyChecklistShortcut(root: HTMLElement): boolean {
  const block = currentBlock(root);
  if (!block || block.tagName !== 'LI') return false;
  const checked = parseChecklistMarker(textBeforeCaret(block).trim());
  if (checked === null) return false;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.setAttribute('aria-label', '切换清单状态');
  block.replaceChildren(checkbox, document.createElement('br'));
  setCaretAfter(checkbox);
  return true;
}

function applyBlockShortcut(root: HTMLElement): boolean {
  const block = currentBlock(root);
  if (!block) return false;
  const marker = textBeforeCaret(block).trim();

  if (applyChecklistShortcut(root)) return true;

  const heading = marker.match(/^(#{1,6})$/);
  if (heading && block.tagName !== 'LI') {
    const replacement = createEmptyBlock(`h${heading[1].length}`);
    replaceBlock(root, block, replacement);
    return true;
  }

  if (marker === '>' && block.tagName !== 'LI') {
    const quote = document.createElement('blockquote');
    const paragraph = createEmptyBlock('p');
    quote.append(paragraph);
    replaceBlock(root, block, quote, paragraph);
    return true;
  }

  if (/^[-*+]$/.test(marker) && block.tagName !== 'LI') {
    const list = document.createElement('ul');
    const item = createEmptyBlock('li');
    list.append(item);
    replaceBlock(root, block, list, item);
    return true;
  }

  if (/^\d+\.$/.test(marker) && block.tagName !== 'LI') {
    const list = document.createElement('ol');
    const item = createEmptyBlock('li');
    list.append(item);
    replaceBlock(root, block, list, item);
    return true;
  }

  return false;
}

function replaceTextShortcut(
  textNode: Text,
  start: number,
  end: number,
  replacement: HTMLElement,
) {
  const before = textNode.data.slice(0, start);
  const after = textNode.data.slice(end);
  const parent = textNode.parentNode;
  if (!parent) return;

  const fragment = document.createDocumentFragment();
  if (before) fragment.append(document.createTextNode(before));
  fragment.append(replacement);
  const afterNode = after ? document.createTextNode(after) : null;
  if (afterNode) fragment.append(afterNode);
  textNode.replaceWith(fragment);

  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (afterNode) {
    range.setStart(afterNode, 0);
  } else {
    range.setStartAfter(replacement);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function applyInlineShortcut(root: HTMLElement): boolean {
  const selection = window.getSelection();
  const node = selection?.anchorNode;
  if (!(node instanceof Text) || !root.contains(node)) return false;

  const offset = selection?.anchorOffset ?? node.data.length;
  const beforeCaret = node.data.slice(0, offset);
  const patterns: Array<{
    regex: RegExp;
    tag: 'strong' | 'em' | 'del' | 'code' | 'a';
  }> = [
    { regex: /\*\*([^*\n]+)\*\*$/, tag: 'strong' },
    { regex: /__([^_\n]+)__$/, tag: 'strong' },
    { regex: /~~([^~\n]+)~~$/, tag: 'del' },
    { regex: /`([^`\n]+)`$/, tag: 'code' },
    { regex: /(?:^|\s)\*([^*\n]+)\*$/, tag: 'em' },
    { regex: /(?:^|\s)_([^_\n]+)_$/, tag: 'em' },
  ];

  for (const { regex, tag } of patterns) {
    const match = beforeCaret.match(regex);
    if (!match || match.index === undefined) continue;
    const leadingSpace = match[0].startsWith(' ') ? 1 : 0;
    const replacement = document.createElement(tag);
    replacement.textContent = match[1];
    replaceTextShortcut(
      node,
      match.index + leadingSpace,
      offset,
      replacement,
    );
    return true;
  }

  const link = beforeCaret.match(/\[([^\]\n]+)\]\(([^)\s]+)\)$/);
  if (link?.index !== undefined && isSafeMarkdownUrl(link[2])) {
    const anchor = document.createElement('a');
    anchor.textContent = link[1];
    anchor.href = link[2];
    replaceTextShortcut(node, link.index, offset, anchor);
    return true;
  }

  return false;
}

export default function LiveMarkdownEditor({
  value,
  recordKey,
  onChange,
  onError,
}: LiveMarkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const appliedRecordRef = useRef('');
  const appliedValueRef = useRef<string | null>(null);

  const emitMarkdown = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    try {
      const markdown = editableHtmlToMarkdown(editor);
      editor.dataset.empty = markdown ? 'false' : 'true';
      appliedValueRef.current = markdown;
      onChange(markdown);
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [onChange, onError]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const recordChanged = appliedRecordRef.current !== recordKey;
    const externalChange = value !== appliedValueRef.current;
    if (!recordChanged && !externalChange) return;

    try {
      editor.innerHTML = value.trim() ? renderEditableMarkdown(value) : '';
      editor.dataset.empty = value.trim() ? 'false' : 'true';
      appliedRecordRef.current = recordKey;
      appliedValueRef.current = value;
    } catch (error) {
      editor.textContent = value;
      editor.dataset.empty = value.trim() ? 'false' : 'true';
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }, [onError, recordKey, value]);

  const handleInput = (event: FormEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    if (!applyChecklistShortcut(root)) {
      applyInlineShortcut(root);
    }
    emitMarkdown();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const command = event.key.toLowerCase();
      if (command === 'b' || command === 'i') {
        event.preventDefault();
        document.execCommand(command === 'b' ? 'bold' : 'italic');
        emitMarkdown();
        return;
      }
    }

    if (event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      if (applyBlockShortcut(event.currentTarget)) {
        event.preventDefault();
        emitMarkdown();
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      const root = event.currentTarget;
      const block = currentBlock(root);
      if (!block || block.tagName === 'PRE') return;

      event.preventDefault();

      if (block === root) {
        insertParagraphAfterRoot(root);
        emitMarkdown();
        return;
      }

      if (block?.tagName === 'LI') {
        const checkbox = Array.from(block.children).find(
          (child) => child instanceof HTMLInputElement && child.type === 'checkbox',
        ) as HTMLInputElement | undefined;
        const label = block.textContent?.trim() ?? '';

        if (checkbox) {
          const list = block.parentElement;
          if (!label) {
            const paragraph = createEmptyBlock('p');
            list?.after(paragraph);
            block.remove();
            if (list && !list.children.length) list.remove();
            setCaretInside(paragraph);
          } else {
            const nextItem = createChecklistItem(false);
            block.after(nextItem);
            setCaretAfter(nextItem.querySelector('input')!);
          }
          emitMarkdown();
          return;
        }

        if (!label) {
          const list = block.parentElement;
          const paragraph = createEmptyBlock('p');
          list?.after(paragraph);
          block.remove();
          if (list && !list.children.length) list.remove();
          setCaretInside(paragraph);
        } else {
          splitBlockAtCaret(block, document.createElement('li'));
        }
        emitMarkdown();
        return;
      }

      const nextParagraph = document.createElement('p');
      if (!splitBlockAtCaret(block, nextParagraph)) {
        block.after(createEmptyBlock('p'));
      }
      emitMarkdown();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const markdown = event.clipboardData.getData('text/plain');
    try {
      const looksStructured = /(^|\n)\s*(#{1,6}\s|[-*+]\s|>\s|\d+\.\s)|\*\*|~~|`/.test(markdown);
      if (looksStructured) {
        document.execCommand('insertHTML', false, renderEditableMarkdown(markdown));
      } else {
        document.execCommand('insertText', false, markdown);
      }
      emitMarkdown();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLAnchorElement) {
      event.preventDefault();
      return;
    }
    if (target instanceof HTMLInputElement && target.type === 'checkbox') {
      emitMarkdown();
    }
  };

  return (
    <div
      ref={editorRef}
      className="markdown-preview live-markdown-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label="备注"
      aria-multiline="true"
      data-empty={!value.trim()}
      data-placeholder="输入 Markdown，例如 # 标题、- 列表、- [ ] 清单、> 引用…"
      spellCheck
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={handleClick}
    />
  );
}
