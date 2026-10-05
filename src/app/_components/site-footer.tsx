import Link from 'next/link';
import { LEGAL_CONTACT_EMAIL, LEGAL_CONTROLLER } from '../_legal/legal-info';
import styles from './site-footer.module.css';
import { TroqMark } from './troq-mark';

// Rodape publico: leva a Politica de Privacidade e aos Termos de Uso a partir
// de qualquer pagina publica, como exigem a LGPD e a tela de consentimento do
// Google (pagina inicial com link para a politica).
export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div>
          <Link href="/" className={styles.brand}>
            <TroqMark size={28} />
            TROQ
          </Link>
          <p className={styles.tagline}>
            Anúncios de troca entre pessoas, com o contato do anunciante protegido até a escolha.
          </p>
        </div>

        <div className={styles.columns}>
          <nav aria-label="Produto">
            <p className={styles.heading}>Produto</p>
            <ul className={styles.list}>
              <li>
                <Link href="/explorar" className={styles.link}>
                  Explorar ofertas
                </Link>
              </li>
              <li>
                <Link href="/cadastro" className={styles.link}>
                  Criar conta
                </Link>
              </li>
              <li>
                <Link href="/login" className={styles.link}>
                  Entrar
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className={styles.heading}>Legal</p>
            <ul className={styles.list}>
              <li>
                <Link href="/privacidade" className={styles.link}>
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <Link href="/termos" className={styles.link}>
                  Termos de Uso
                </Link>
              </li>
              <li>
                <Link href="/politica/itens-proibidos" className={styles.link}>
                  Itens proibidos
                </Link>
              </li>
            </ul>
          </nav>
          <div>
            <p className={styles.heading}>Contato</p>
            <ul className={styles.list}>
              <li>
                <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={styles.link}>
                  {LEGAL_CONTACT_EMAIL}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.legal}>
          <p>© 2026 TROQ · {LEGAL_CONTROLLER}</p>
          <p>Pagamentos via Pix processados pelo Mercado Pago.</p>
        </div>
      </div>
    </footer>
  );
}
