import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { HowItWorks } from './_components/how-it-works';
import { LatestOffers, OffersLoading } from './_components/latest-offers';
import styles from './home.module.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'TROQS — anúncios entre pessoas com contato protegido',
  description:
    'Veja ofertas publicadas sem precisar de login. O contato do anunciante só é liberado à pessoa escolhida, após solicitação paga de R$ 0,99.',
};

// Icones de traco, decorativos (o texto ao lado carrega o significado).
function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const CheckIcon = ({ size = 18 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>
);

const LockIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <rect x="4" y="11" width="16" height="10" rx="2.5" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

const EyeIcon = () => (
  <Icon>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

const HandIcon = () => (
  <Icon>
    <path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V13m0-3.5a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3.4 15a1.6 1.6 0 0 1 2.7-1.7L7 14.5" />
  </Icon>
);

const ShieldIcon = () => (
  <Icon size={20}>
    <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
);

const ArrowIcon = () => (
  <span className={styles.arrow}>
    <Icon size={18}>
      <path d="M5 12h14m-6-6 6 6-6 6" />
    </Icon>
  </span>
);

// Ilustracao do hero: composicao abstrata, sem item, preco ou texto de anuncio,
// para nao se confundir com uma oferta real (#59).
function HeroArt() {
  return (
    <div className={styles.art} aria-hidden="true">
      <div className={styles.artGlow} />
      <div className={styles.artCard}>
        <div className={styles.artMedia}>
          <span className={styles.artShapeA} />
          <span className={styles.artShapeB} />
          <span className={styles.artShapeC} />
          <span className={styles.artLock}>
            <LockIcon size={14} />
            Contato protegido
          </span>
        </div>
        <div className={styles.artLines}>
          <span className={styles.artLine} />
          <span className={styles.artLine} />
          <span className={styles.artLine} />
        </div>
      </div>
      <div className={`${styles.chip} ${styles.chipPix}`}>
        <span className={styles.chipIcon}>
          <Icon size={18}>
            <path d="m12 3 3 3-3 3-3-3 3-3Zm6 6 3 3-3 3-3-3 3-3ZM6 9l3 3-3 3-3-3 3-3Zm6 6 3 3-3 3-3-3 3-3Z" />
          </Icon>
        </span>
        <span>
          Pix · R$ 0,99
          <span className={styles.chipSub}>Solicitação de contato</span>
        </span>
      </div>
      <div className={`${styles.chip} ${styles.chipChosen}`}>
        <span className={styles.chipIcon}>
          <CheckIcon />
        </span>
        <span>
          Você foi escolhido
          <span className={styles.chipSub}>Contato liberado só para você</span>
        </span>
      </div>
    </div>
  );
}

const VALUES = [
  {
    icon: <EyeIcon />,
    title: 'Veja tudo sem login',
    text: 'Ofertas e detalhes de cada anúncio ficam abertos. Você só cria conta quando quiser pedir um contato ou anunciar.',
  },
  {
    icon: <LockIcon />,
    title: 'Contato fora do anúncio',
    text: 'O WhatsApp/telefone do anunciante nunca aparece na página do anúncio, e o texto do anúncio não pode trazer telefone, e-mail ou endereço.',
  },
  {
    icon: <HandIcon />,
    title: 'Quem anuncia escolhe',
    text: 'Cada anúncio recebe no máximo três solicitações pagas, e o anunciante escolhe para quem liberar o contato.',
  },
] as const;

const STEPS = [
  {
    title: 'Encontre e demonstre interesse',
    text: 'Navegue pelas ofertas e marque interesse de graça. O interesse não libera o contato.',
  },
  {
    title: 'Solicite o contato por R$ 0,99',
    text: 'Com o e-mail verificado, faça a solicitação paga via Pix. Cada anúncio aceita até três.',
  },
  {
    title: 'O anunciante escolhe',
    text: 'Só a pessoa escolhida recebe o WhatsApp/telefone. A partir daí, a negociação é entre vocês.',
  },
] as const;

export default function HomePage() {
  return (
    <div className={styles.page}>
      <main>
        <section className={styles.hero}>
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div>
              <p className={styles.eyebrow}>
                <span className={styles.eyebrowDot} aria-hidden="true" />
                Anúncios entre pessoas
              </p>
              <h1 className={styles.title}>
                Troque entre pessoas, com{' '}
                <span className={styles.titleAccent}>contato protegido</span>
              </h1>
              <p className={styles.lead}>
                No TROQS você vê as ofertas e os detalhes de cada anúncio sem precisar de login. O
                WhatsApp/telefone do anunciante só é liberado à pessoa que ele escolher.
              </p>
              <div className={styles.actions}>
                <Link href="/explorar" className={styles.buttonPrimary}>
                  Explorar ofertas
                  <ArrowIcon />
                </Link>
                <Link href="/cadastro" className={styles.buttonSecondary}>
                  Criar conta grátis
                </Link>
              </div>
              <ul className={styles.reassurance}>
                <li>
                  <span className={styles.check}>
                    <CheckIcon />
                  </span>
                  Sem login para ver
                </li>
                <li>
                  <span className={styles.check}>
                    <CheckIcon />
                  </span>
                  Interesse gratuito
                </li>
                <li>
                  <span className={styles.check}>
                    <CheckIcon />
                  </span>
                  Pix só para pedir contato
                </li>
              </ul>
            </div>
            <HeroArt />
          </div>
        </section>

        <section aria-label="Por que usar o TROQS" className={styles.values}>
          <div className={styles.container}>
            <ul className={styles.valueGrid}>
              {VALUES.map((value) => (
                <li key={value.title} className={styles.valueCard}>
                  <span className={styles.valueIcon}>{value.icon}</span>
                  <h2 className={styles.valueTitle}>{value.title}</h2>
                  <p className={styles.valueText}>{value.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          aria-labelledby="ofertas-recentes"
          className={`${styles.section} ${styles.offers}`}
        >
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Vitrine</p>
                <h2 id="ofertas-recentes" className={styles.sectionTitle}>
                  Ofertas recentes
                </h2>
              </div>
              <Link href="/explorar" className={styles.textLink}>
                Explorar todas <ArrowIcon />
              </Link>
            </div>
            <Suspense fallback={<OffersLoading />}>
              <LatestOffers />
            </Suspense>
          </div>
        </section>

        <section aria-labelledby="passo-a-passo" className={`${styles.section} ${styles.how}`}>
          <div className={styles.container}>
            <div className={styles.sectionHeader}>
              <div>
                <p className={styles.kicker}>Passo a passo</p>
                <h2 id="passo-a-passo" className={styles.sectionTitle}>
                  Do interesse ao contato, sem expor ninguém
                </h2>
              </div>
            </div>
            <ol className={styles.steps}>
              {STEPS.map((step, index) => (
                <li key={step.title} className={styles.step}>
                  <span className={styles.stepNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepText}>{step.text}</p>
                </li>
              ))}
            </ol>
            <div className={styles.rules}>
              <HowItWorks headingLevel={3} />
            </div>
          </div>
        </section>

        <section aria-labelledby="privacidade" className={`${styles.section} ${styles.trust}`}>
          <div className={`${styles.container} ${styles.trustGrid}`}>
            <div>
              <p className={styles.kicker}>Privacidade</p>
              <h2 id="privacidade" className={styles.sectionTitle}>
                Seu contato fica com você
              </h2>
              <p className={styles.sectionLead}>
                O TROQS foi desenhado para que telefone e WhatsApp não circulem à toa. Pedimos só o
                necessário e explicamos tudo na nossa política.
              </p>
              <div className={styles.trustLinks}>
                <Link href="/privacidade" className={styles.trustLink}>
                  Política de Privacidade
                </Link>
                <Link href="/termos" className={styles.trustLink}>
                  Termos de Uso
                </Link>
                <Link href="/politica/itens-proibidos" className={styles.trustLink}>
                  Itens proibidos
                </Link>
              </div>
            </div>
            <ul className={styles.trustList}>
              <li className={styles.trustItem}>
                <span className={styles.trustIcon}>
                  <ShieldIcon />
                </span>
                <span>
                  <strong>Liberação só para quem foi escolhido</strong>O contato do anunciante é
                  entregue apenas à pessoa escolhida, com pagamento aprovado, e cada acesso fica
                  registrado.
                </span>
              </li>
              <li className={styles.trustItem}>
                <span className={styles.trustIcon}>
                  <ShieldIcon />
                </span>
                <span>
                  <strong>Pix pelo Mercado Pago</strong>O pagamento é processado pelo Mercado Pago.
                  O TROQS não armazena dados bancários.
                </span>
              </li>
              <li className={styles.trustItem}>
                <span className={styles.trustIcon}>
                  <ShieldIcon />
                </span>
                <span>
                  <strong>Sem rastreamento de anúncios</strong>Não usamos ferramentas de publicidade
                  nem guardamos o seu endereço IP na sessão.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section aria-labelledby="para-anunciantes" className={styles.ctaWrap}>
          <div className={styles.container}>
            <div className={styles.cta}>
              <div>
                <h2 id="para-anunciantes" className={styles.ctaTitle}>
                  Quer anunciar?
                </h2>
                <p className={styles.ctaText}>
                  Crie uma conta, confirme seu e-mail e cadastre seu anúncio. Ele só aparece para o
                  público depois de publicado, e o seu contato nunca é exibido na página do anúncio.
                </p>
              </div>
              <div className={styles.ctaActions}>
                <Link href="/cadastro" className={`${styles.buttonSecondary} ${styles.ctaPrimary}`}>
                  Criar conta
                </Link>
                <Link href="/anuncios" className={`${styles.buttonSecondary} ${styles.ctaGhost}`}>
                  Meus anúncios
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
