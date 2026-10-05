import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocument, legalStyles as s, type LegalSection } from '../_legal/legal-document';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER,
  LEGAL_UPDATED_AT,
  TERMS_PAGE_VERSION,
} from '../_legal/legal-info';

// Termos de Uso publicos: a versao aceita no cadastro (TERMS_VERSION). As
// regras vem das decisoes registradas, sem criar regra nova: fluxo e limites
// (docs/product/business-rules.md, RB-001 a RB-005), excecoes de pagamento
// (payment-exceptions.md, DEC-037), itens proibidos (DEC-031), contato fora do
// texto (DEC-049), alternativas de troca (DEC-046), 18+ (age-eligibility.md,
// DEC-034) e retencao (data-retention-policy.md). Mudou o texto? Suba
// TERMS_VERSION em src/modules/identity/terms.ts.

export const metadata: Metadata = {
  title: 'Termos de Uso — TROQ',
  description:
    'Regras para usar o TROQ: conta, anúncios, solicitação paga de R$ 0,99, escolha, liberação do contato, reembolso técnico e responsabilidades.',
};

const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: 'aceite',
    title: 'Aceite destes termos',
    body: (
      <>
        <p>
          Estes Termos de Uso regem o uso do TROQ (troqs.app), mantido por{' '}
          <strong>{LEGAL_CONTROLLER}</strong>. Ao criar uma conta, você declara ter 18 anos ou mais
          e aceita estes termos e a <Link href="/privacidade">Política de Privacidade</Link>. A
          versão aceita e a data do aceite ficam registradas na sua conta.
        </p>
        <p>
          Ver ofertas e detalhes de anúncios não exige conta. As regras sobre conteúdo e conduta
          valem para qualquer pessoa que use o site.
        </p>
      </>
    ),
  },
  {
    id: 'servico',
    title: 'O que é o TROQ',
    body: (
      <>
        <p>
          O TROQ é uma plataforma de anúncios de troca entre pessoas. Quem anuncia publica um item e
          as alternativas que aceita em troca; quem se interessa pode demonstrar interesse de graça
          ou fazer uma solicitação paga para receber o contato do anunciante, se for escolhido.
        </p>
        <div className={s.callout}>
          <p>
            O TROQ <strong>não é parte da troca</strong>. Não somos donos dos itens, não os
            inspecionamos, não fazemos entrega e não garantimos que a troca aconteça. A negociação,
            o encontro e a troca são combinados diretamente entre as pessoas.
          </p>
        </div>
      </>
    ),
  },
  {
    id: 'conta',
    title: 'Sua conta',
    body: (
      <ul>
        <li>
          O TROQ é destinado exclusivamente a maiores de 18 anos, por decisão do serviço. Contas de
          menores de 18 anos serão encerradas.
        </li>
        <li>
          Você pode se cadastrar com e-mail e senha ou com uma conta Google. Para anunciar ou fazer
          solicitações, o e-mail precisa estar verificado.
        </li>
        <li>
          Informe dados verdadeiros, mantenha sua senha em sigilo e não compartilhe a conta. Você é
          responsável pelo que for feito nela.
        </li>
        <li>Cada pessoa deve ter uma única conta e não pode se passar por outra pessoa.</li>
      </ul>
    ),
  },
  {
    id: 'anuncios',
    title: 'Anúncios',
    body: (
      <>
        <ul>
          <li>
            O anunciante é o único responsável pelo item e pelo conteúdo do anúncio, que deve ser
            verdadeiro e descrever o item com fidelidade.
          </li>
          <li>Cada anúncio informa três alternativas de troca aceitas pelo anunciante.</li>
          <li>
            É proibido anunciar itens das categorias da{' '}
            <Link href="/politica/itens-proibidos">Política de itens proibidos</Link>. Ao publicar,
            o anunciante declara que o item não pertence a nenhuma delas. Um item que não esteja na
            lista não é, só por isso, permitido.
          </li>
          <li>
            Título, descrição e alternativas de troca não podem conter telefone, WhatsApp, e-mail ou
            endereço. O contato é entregue pelo próprio TROQ, só à pessoa escolhida.
          </li>
          <li>
            A localização exibida é apenas cidade e UF. As fotos devem ser do item e você precisa
            ter o direito de usá-las.
          </li>
          <li>
            Ao publicar, você autoriza o TROQ a exibir o conteúdo do anúncio no site enquanto ele
            estiver publicado.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'solicitacao',
    title: 'Interesse e solicitação paga',
    body: (
      <ul>
        <li>Demonstrar interesse é gratuito e não libera o contato.</li>
        <li>
          Para pedir o contato, é preciso fazer uma <strong>solicitação paga de R$ 0,99</strong> via
          Pix, processada pelo Mercado Pago.
        </li>
        <li>
          Cada anúncio aceita no máximo <strong>três solicitações pagas</strong>, e cada conta pode
          ter uma solicitação em andamento por anúncio. A vaga fica reservada por um prazo informado
          na tela do pagamento; se o Pix não for pago a tempo, a vaga é liberada.
        </li>
        <li>
          <strong>Pagar não garante ser escolhido.</strong> A cobrança é definitiva: não há
          reembolso por não ser escolhido, por nova escolha do anunciante, por negociação encerrada,
          por anúncio pausado ou removido, por arrependimento ou por insatisfação com a troca.
        </li>
      </ul>
    ),
  },
  {
    id: 'reembolso',
    title: 'Reembolso técnico',
    body: (
      <>
        <p>O reembolso existe apenas como exceção técnica, sempre integral, nestes casos:</p>
        <ol>
          <li>pagamento em duplicidade para a mesma solicitação;</li>
          <li>pagamento creditado depois de a reserva da vaga ter expirado;</li>
          <li>pagamento sem uma reserva válida correspondente;</li>
          <li>cobrança gerada por falha do TROQ.</li>
        </ol>
        <p>
          Uma cobrança que não chegou a ser paga é cancelada, não reembolsada. O reembolso segue os
          prazos e limites do Mercado Pago. Se o pagador desfizer o pagamento por devolução do Pix
          ou outro mecanismo do sistema financeiro, a solicitação deixa de poder ser escolhida.
        </p>
      </>
    ),
  },
  {
    id: 'escolha',
    title: 'Escolha e liberação do contato',
    body: (
      <ul>
        <li>
          O anunciante escolhe uma das solicitações pagas. Só a pessoa escolhida, com pagamento
          aprovado, recebe o telefone/WhatsApp do anunciante.
        </li>
        <li>Depois de liberado, o contato não é retirado de quem o recebeu.</li>
        <li>
          O contato recebido serve apenas para negociar aquele anúncio. É proibido repassá-lo,
          divulgá-lo, usá-lo para propaganda ou para assediar o anunciante.
        </li>
      </ul>
    ),
  },
  {
    id: 'negociacao',
    title: 'Negociação entre as pessoas',
    body: (
      <>
        <p>
          A negociação acontece fora do TROQ, entre o anunciante e a pessoa escolhida. Encerrar a
          negociação no TROQ não significa que a troca aconteceu. Divergências sobre o item, a troca
          ou a conduta da outra pessoa são resolvidas entre os envolvidos; o TROQ não julga a troca.
        </p>
        <p>
          Para sua segurança, prefira encontros em locais públicos e movimentados, confira o item
          antes de trocar e desconfie de pedidos de pagamento antecipado fora do TROQ.
        </p>
      </>
    ),
  },
  {
    id: 'condutas',
    title: 'Condutas proibidas',
    body: (
      <ul>
        <li>Publicar anúncios falsos, enganosos ou de itens que você não tem.</li>
        <li>Aplicar golpes, fraudes ou tentar contornar o pagamento ou os limites do serviço.</li>
        <li>Assediar, ameaçar ou discriminar outras pessoas.</li>
        <li>
          Coletar dados do site de forma automatizada ou interferir no funcionamento do serviço.
        </li>
        <li>Publicar conteúdo ilegal ou que viole direitos de terceiros.</li>
      </ul>
    ),
  },
  {
    id: 'moderacao',
    title: 'Moderação e sanções',
    body: (
      <p>
        Para proteger as pessoas e cumprir a lei, podemos remover anúncios e advertir, restringir ou
        bloquear contas que descumpram estes termos ou a Política de itens proibidos, de forma
        proporcional à gravidade. Você pode denunciar anúncios ou condutas e contestar uma decisão
        pelo e-mail {mail}.
      </p>
    ),
  },
  {
    id: 'encerramento',
    title: 'Encerramento da conta',
    body: (
      <p>
        Você pode pedir a exclusão da sua conta a qualquer momento pelo e-mail {mail}. Os anúncios
        deixam de aparecer imediatamente, e os dados são tratados conforme a{' '}
        <Link href="/privacidade">Política de Privacidade</Link>. Valores pagos por solicitações já
        feitas seguem as regras das seções 5 e 6.
      </p>
    ),
  },
  {
    id: 'responsabilidade',
    title: 'Disponibilidade e responsabilidade',
    body: (
      <p>
        Trabalhamos para manter o TROQ disponível e seguro, mas o serviço pode passar por
        manutenções e falhas. O TROQ não responde pelos itens anunciados, pela conduta das pessoas
        nem pelo resultado das trocas, nos limites permitidos pela lei. Nada nestes termos afasta os
        direitos garantidos pelo Código de Defesa do Consumidor.
      </p>
    ),
  },
  {
    id: 'propriedade',
    title: 'Propriedade intelectual',
    body: (
      <p>
        A marca, o nome e o software do TROQ pertencem ao seu mantenedor. O conteúdo dos anúncios
        continua sendo de quem o publicou, que autoriza sua exibição no TROQ nos termos da seção 4.
      </p>
    ),
  },
  {
    id: 'alteracoes',
    title: 'Alterações destes termos',
    body: (
      <p>
        Podemos atualizar estes termos. A versão e a data ficam no topo desta página, e mudanças
        relevantes serão avisadas no site ou por e-mail antes de valer. Se você não concordar com a
        nova versão, pode encerrar sua conta.
      </p>
    ),
  },
  {
    id: 'lei',
    title: 'Lei aplicável e contato',
    body: (
      <p>
        Estes termos seguem a lei brasileira. Fica eleito o foro do domicílio do consumidor.
        Dúvidas, denúncias e pedidos: {mail}.
      </p>
    ),
  },
];

export default function TermosPage() {
  return (
    <LegalDocument
      kicker="Termos"
      title="Termos de Uso"
      summary={
        <>
          As regras do TROQ em linguagem direta: interesse é gratuito, a solicitação de contato
          custa R$ 0,99, cada anúncio aceita até três, e só a pessoa escolhida recebe o contato.
        </>
      }
      meta={[
        `Versão ${TERMS_PAGE_VERSION}`,
        `Atualizados em ${LEGAL_UPDATED_AT}`,
        `Responsável: ${LEGAL_CONTROLLER}`,
      ]}
      sections={sections}
    />
  );
}
