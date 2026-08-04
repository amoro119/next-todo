"use client";

import type { IPureNode } from 'markmap-common';
import type { Markmap } from 'markmap-view';
import {
  Focus,
  Maximize2,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { Button } from '@/components/ui/button';
import {
  buildMindmapMarkdown,
  mindmapOutlineText,
  sanitizeMindmapTree,
} from './markdownMindmapData';

export interface MarkdownMindmapProps {
  markdown: string;
  rootLabel: string;
  fullscreen?: boolean;
  onRequestFullscreen?: () => void;
}

export default function MarkdownMindmap({
  markdown,
  rootLabel,
  fullscreen = false,
  onRequestFullscreen,
}: MarkdownMindmapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const markmapRef = useRef<Markmap | null>(null);
  const transformerRef = useRef<import('markmap-lib').Transformer | null>(null);
  const firstFitRef = useRef(true);
  const markdownRef = useRef(markdown);
  const rootLabelRef = useRef(rootLabel);
  const [outline, setOutline] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  markdownRef.current = markdown;
  rootLabelRef.current = rootLabel;

  const transform = useCallback((): IPureNode | null => {
    const transformer = transformerRef.current;
    if (!transformer) return null;

    const source = buildMindmapMarkdown(markdownRef.current, rootLabelRef.current);
    const transformed = transformer.transform(source);
    return sanitizeMindmapTree(transformed.root, rootLabelRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    let svg: SVGSVGElement | null = null;
    let resizeFrame = 0;
    let nodeKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;

    const setRenderError = (error: unknown) => {
      if (cancelled) return;
      setErrorMessage(error instanceof Error ? error.message : '未知错误');
      setStatus('error');
    };

    async function initialize() {
      try {
        setStatus('loading');
        const [{ Transformer }, { Markmap: MarkmapView }] = await Promise.all([
          import('markmap-lib/no-plugins'),
          import('markmap-view'),
        ]);
        if (cancelled || !svgRef.current) return;

        transformerRef.current = new Transformer();
        const root = transform();
        if (!root) return;

        setOutline(mindmapOutlineText(root));
        const instance = MarkmapView.create(svgRef.current, {
          autoFit: false,
          duration: 180,
          embedGlobalCSS: true,
          fitRatio: 0.92,
          initialExpandLevel: -1,
          maxInitialScale: 1.2,
          maxWidth: 240,
          nodeMinHeight: 20,
          paddingX: 8,
          pan: true,
          scrollForPan: false,
          spacingHorizontal: 72,
          spacingVertical: 8,
          toggleRecursively: false,
          zoom: true,
          color: (node) => {
            if (node.state.depth === 0) return 'oklch(var(--foreground))';
            if (node.state.depth === 1) return 'oklch(var(--muted-foreground))';
            return 'oklch(var(--foreground) / 0.72)';
          },
          lineWidth: (node) => (node.state.depth === 0 ? 1.5 : 1),
        }, root);
        markmapRef.current = instance;

        svg = svgRef.current;
        const makeNodesKeyboardAccessible = () => {
          for (const circle of svg?.querySelectorAll<SVGCircleElement>('.markmap-node > circle') ?? []) {
            circle.setAttribute('tabindex', '0');
            circle.setAttribute('role', 'button');
            circle.setAttribute('aria-label', '折叠或展开此节点');
          }
        };
        nodeKeyDownHandler = (event: KeyboardEvent) => {
          if (
            (event.key === 'Enter' || event.key === ' ')
            && event.target instanceof SVGCircleElement
          ) {
            event.preventDefault();
            event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        };
        makeNodesKeyboardAccessible();
        svg.addEventListener('keydown', nodeKeyDownHandler);
        mutationObserver = new MutationObserver(makeNodesKeyboardAccessible);
        mutationObserver.observe(svg, { childList: true, subtree: true });

        const renderForCurrentSize = () => {
          window.cancelAnimationFrame(resizeFrame);
          resizeFrame = window.requestAnimationFrame(() => {
            if (cancelled || !svg) return;

            const bounds = svg.getBoundingClientRect();
            if (bounds.width < 2 || bounds.height < 2) return;

            const render = firstFitRef.current ? instance.fit() : instance.renderData();
            void render
              .then(() => {
                if (cancelled) return;
                firstFitRef.current = false;
                setStatus('ready');
              })
              .catch(setRenderError);
          });
        };

        renderForCurrentSize();

        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(renderForCurrentSize);
          resizeObserver.observe(svgRef.current.parentElement ?? svgRef.current);
        }
      } catch (error) {
        setRenderError(error);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(resizeFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      if (svg && nodeKeyDownHandler) {
        svg.removeEventListener('keydown', nodeKeyDownHandler);
      }
      markmapRef.current?.destroy();
      markmapRef.current = null;
      transformerRef.current = null;
    };
  }, [transform]);

  useEffect(() => {
    const instance = markmapRef.current;
    if (!instance || !transformerRef.current) return;

    try {
      const root = transform();
      if (!root) return;
      setOutline(mindmapOutlineText(root));
      void instance.setData(root);
      setStatus('ready');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '未知错误');
      setStatus('error');
    }
  }, [markdown, rootLabel, transform]);

  return (
    <section
      className={`task-mindmap ${fullscreen ? 'task-mindmap--fullscreen' : ''}`}
      aria-label="备注思维导图"
      data-note-editor={fullscreen ? 'true' : undefined}
      tabIndex={fullscreen ? -1 : undefined}
    >
      <div className="task-mindmap__toolbar">
        <span className="task-mindmap__title">
          {fullscreen ? (rootLabel.trim() || '未命名任务') : '思维导图'}
        </span>
        <div className="task-mindmap__controls">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void markmapRef.current?.rescale(1.2)}
            disabled={status !== 'ready'}
            aria-label="放大导图"
            title="放大"
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void markmapRef.current?.rescale(0.8)}
            disabled={status !== 'ready'}
            aria-label="缩小导图"
            title="缩小"
          >
            <Minus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => void markmapRef.current?.fit()}
            disabled={status !== 'ready'}
            aria-label="适应导图画布"
            title="适应画布"
          >
            <Focus aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={async () => {
              const instance = markmapRef.current;
              const root = transform();
              if (!instance || !root) return;
              await instance.setData(root);
              await instance.fit();
            }}
            disabled={status !== 'ready'}
            aria-label="重置导图"
            title="重置"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          {onRequestFullscreen && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRequestFullscreen}
              aria-label="放大显示导图"
              title="放大显示"
            >
              <Maximize2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
      <div className="task-mindmap__canvas">
        {status === 'loading' && (
          <div className="task-mindmap__status" role="status">正在生成导图…</div>
        )}
        {status === 'error' && (
          <div className="task-mindmap__status task-mindmap__status--error" role="alert">
            导图生成失败。备注仍可继续编辑。
            {errorMessage ? <span className="sr-only">{errorMessage}</span> : null}
          </div>
        )}
        <svg
          ref={svgRef}
          className="task-mindmap__svg"
          style={{
            '--markmap-font': '400 0.875rem/1.5 var(--font-sans)',
            '--markmap-text-color': 'oklch(var(--foreground))',
            '--markmap-code-bg': 'oklch(var(--muted))',
            '--markmap-code-color': 'oklch(var(--foreground))',
            '--markmap-circle-open-bg': 'oklch(var(--background))',
          } as CSSProperties}
          role="img"
          aria-label={`${rootLabel.trim() || '任务'}的备注思维导图`}
        />
      </div>
      <pre className="sr-only" aria-label="思维导图层级大纲">{outline}</pre>
    </section>
  );
}
