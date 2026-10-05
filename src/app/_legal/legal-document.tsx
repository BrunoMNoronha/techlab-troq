import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter } from '../_components/site-footer';
import { TroqMark } from '../_components/troq-mark';
import styles from './legal.module.css';

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

// Moldura das paginas legais publicas (/privacidade, /termos): cabecalho,
// resumo com versao e data, sumario ancorado e secoes numeradas.
export function LegalDocument({
  kicker,
  title,
  summary,
  meta,
  sections,
}: {
  kicker: string;
  title: string;
  summary: ReactNode;
  meta: string[];
  sections: LegalSection[];
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand}>
            <TroqMark />
            TROQ
          </Link>
          <Link href="/explorar" className={styles.headerLink}>
            Explorar ofertas
          </Link>
        </div>
      </header>

      <main>
        <div className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.kicker}>{kicker}</p>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.summary}>{summary}</p>
            <ul className={styles.meta}>
              {meta.map((item) => (
                <li key={item} className={styles.metaItem}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.layout}>
          <nav aria-label="Nesta página" className={styles.toc}>
            <p className={styles.tocTitle}>Nesta página</p>
            <ol className={styles.tocList}>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={styles.tocLink}>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <article className={styles.article}>
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-titulo`}
                className={styles.section}
              >
                <h2 id={`${section.id}-titulo`}>
                  {index + 1}. {section.title}
                </h2>
                {section.body}
              </section>
            ))}
          </article>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

export const legalStyles = styles;
