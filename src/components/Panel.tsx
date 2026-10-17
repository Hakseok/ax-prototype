import type { CSSProperties, ReactNode } from 'react';
import './Panel.css';

interface PanelProps {
  title?: ReactNode;
  /** Small text after the title, e.g. period or unit. */
  caption?: ReactNode;
  /** Right side of the header: legend, links, secondary buttons. */
  extra?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

// Card surface used for every body region.
export function Panel({ title, caption, extra, children, className, style }: PanelProps) {
  return (
    <section className={['panel', className].filter(Boolean).join(' ')} style={style}>
      {(title || extra) && (
        <header className="panel__header">
          {title && <h2 className="panel__title">{title}</h2>}
          {caption && <span className="caption">{caption}</span>}
          <span className="panel__spacer" />
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}
