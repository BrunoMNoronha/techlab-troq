import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalDocument, legalStyles as s, type LegalSection } from '../_legal/legal-document';
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_CONTROLLER,
  LEGAL_UPDATED_AT,
  PRIVACY_POLICY_VERSION,
} from '../_legal/legal-info';

// Politica de Privacidade publica (LGPD; exigida pela tela de consentimento do
// Google). Cada afirmacao vem de uma decisao registrada: dados do esquema
// (prisma/schema.prisma), retencao (docs/product/data-retention-policy.md,
// secao 11), fornecedores e regioes (docs/engineering/environments.md,
// database.md, deployment.md), cookies (identity-contract.md IC-15.2) e IP
// desligado (src/modules/identity/auth.ts). Mudou um fato? Atualize aqui e suba
// PRIVACY_POLICY_VERSION.

export const metadata: Metadata = {
  title: 'Política de Privacidade — TROQ',
  description:
    'Quais dados o TROQ coleta, para que usa, com quem compartilha, por quanto tempo guarda e como exercer seus direitos pela LGPD.',
};

const mail = <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>;

const sections: LegalSection[] = [
  {
    id: 'quem-somos',
    title: 'Quem somos',
    body: (
      <>
        <p>
          O TROQ (troqs.app) é uma plataforma de anúncios de troca entre pessoas em que o contato do
          anunciante só é liberado à pessoa que ele escolher. O controlador dos dados pessoais
          tratados no TROQ é <strong>{LEGAL_CONTROLLER}</strong>, que pode ser contatado pelo e-mail{' '}
          {mail}, também canal do encarregado pelo tratamento de dados pessoais.
        </p>
        <p>
          Esta política explica, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018 —
          LGPD), quais dados tratamos, por quê, com quem compartilhamos, por quanto tempo guardamos
          e como você exerce os seus direitos. Ela se aplica ao site e a todos os serviços do TROQ.
        </p>
      </>
    ),
  },
  {
    id: 'dados',
    title: 'Dados que coletamos',
    body: (
      <>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                <th scope="col">O que é</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Conta</td>
                <td>
                  Nome de exibição, e-mail e a confirmação de que o e-mail foi verificado. A senha é
                  guardada só como hash irreversível. Se você entra com o Google, guardamos o
                  identificador da sua conta Google em vez de senha.
                </td>
              </tr>
              <tr>
                <td>Declarações</td>
                <td>
                  Declaração de ter 18 anos ou mais e aceite dos Termos de Uso, com a versão e a
                  data do aceite. Também a declaração de que o item anunciado não é proibido, a cada
                  publicação.
                </td>
              </tr>
              <tr>
                <td>Contato do anunciante</td>
                <td>
                  Número de telefone/WhatsApp cadastrado por quem anuncia. Ele nunca aparece no
                  anúncio e só é entregue à pessoa escolhida.
                </td>
              </tr>
              <tr>
                <td>Anúncios</td>
                <td>
                  Título, descrição, alternativas de troca, cidade e UF, e fotos. A foto original é
                  apagada em até 24 horas; guardamos só as versões processadas exibidas no site.
                </td>
              </tr>
              <tr>
                <td>Solicitações e pagamentos</td>
                <td>
                  Interesses, solicitações, escolha e liberação de contato. Do pagamento Pix,
                  guardamos os identificadores do pedido e do pagamento no Mercado Pago, valor,
                  situação e data de crédito. Não guardamos dados bancários.
                </td>
              </tr>
              <tr>
                <td>Registros técnicos e de segurança</td>
                <td>
                  Registros de acesso à aplicação, registro de cada acesso a um contato liberado e
                  relatórios de erro técnico, com e-mail e telefone mascarados.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>O que não coletamos:</strong> documento de identidade, data de nascimento,
          endereço, localização precisa (só cidade e UF do anúncio) e dados de cartão ou de conta
          bancária. O endereço IP não é gravado na sua sessão nem nos relatórios de erro.
        </p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para que usamos e com qual base legal',
    body: (
      <div className={s.tableWrap}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Finalidade</th>
              <th scope="col">Base legal (art. 7º da LGPD)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                Criar e manter sua conta, publicar anúncios, registrar interesses e solicitações,
                processar o Pix e entregar o contato à pessoa escolhida
              </td>
              <td>Execução de contrato (inciso V)</td>
            </tr>
            <tr>
              <td>Enviar e-mails de verificação e avisos sobre suas solicitações e pagamentos</td>
              <td>Execução de contrato (inciso V)</td>
            </tr>
            <tr>
              <td>
                Guardar registros de acesso à aplicação e registros financeiros pelo prazo exigido
                em lei
              </td>
              <td>Cumprimento de obrigação legal (inciso II)</td>
            </tr>
            <tr>
              <td>
                Prevenir fraude e abuso, aplicar a política de itens proibidos, moderar anúncios e
                monitorar erros técnicos
              </td>
              <td>Legítimo interesse (inciso IX)</td>
            </tr>
            <tr>
              <td>Manter a auditoria de acessos ao contato para apurar disputas</td>
              <td>Exercício regular de direitos (inciso VI)</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
  },
  {
    id: 'google',
    title: 'Entrar com o Google',
    body: (
      <>
        <p>
          Se você escolhe “Continuar com Google”, recebemos do Google apenas o seu nome, o seu
          endereço de e-mail, a informação de que esse e-mail é verificado e um identificador da sua
          conta Google. Não recebemos sua senha do Google nem acesso a contatos, arquivos, agenda ou
          qualquer outro dado da sua conta.
        </p>
        <p>
          Usamos esses dados só para criar a sua conta no TROQ e permitir que você entre nela. Eles
          não são usados para publicidade, não são vendidos e não são compartilhados com terceiros,
          exceto com os fornecedores que operam o TROQ (seção 5) e quando a lei exigir.
        </p>
        <div className={s.callout}>
          <p>
            O uso e a transferência, pelo TROQ, de informações recebidas das APIs do Google seguem a{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">
              Política de Dados do Usuário dos Serviços de API do Google
            </a>
            , incluindo os requisitos de Uso Limitado.
          </p>
        </div>
        <p>
          Você pode remover o acesso do TROQ à sua conta Google a qualquer momento em{' '}
          <a href="https://myaccount.google.com/connections">myaccount.google.com/connections</a>.
          Isso não apaga sua conta no TROQ; para isso, veja a seção 9.
        </p>
      </>
    ),
  },
  {
    id: 'compartilhamento',
    title: 'Com quem compartilhamos',
    body: (
      <>
        <p>
          <strong>Não vendemos dados pessoais.</strong> Compartilhamos dados apenas nestes casos:
        </p>
        <ul>
          <li>
            <strong>Com o público:</strong> o conteúdo do anúncio publicado (título, descrição,
            alternativas de troca, cidade, UF e fotos).
          </li>
          <li>
            <strong>Com a pessoa escolhida:</strong> o telefone/WhatsApp do anunciante, somente
            depois da escolha e com o pagamento aprovado.
          </li>
          <li>
            <strong>Com fornecedores que operam o serviço</strong>, que tratam dados em nosso nome e
            só para essa finalidade:
            <ul>
              <li>Vercel — hospedagem do site (região de São Paulo);</li>
              <li>Neon — banco de dados (região de São Paulo);</li>
              <li>Cloudflare R2 — armazenamento das fotos dos anúncios;</li>
              <li>Resend — envio de e-mails (região de São Paulo);</li>
              <li>Sentry — monitoramento de erros técnicos, sem IP e com dados mascarados;</li>
              <li>
                Mercado Pago — processamento do Pix, que recebe o seu e-mail para identificar o
                pagamento;
              </li>
              <li>Google — autenticação, quando você escolhe entrar com o Google.</li>
            </ul>
          </li>
          <li>
            <strong>Com autoridades</strong>, quando houver obrigação legal ou ordem judicial.
          </li>
        </ul>
        <p>
          Alguns desses fornecedores são empresas estrangeiras e podem tratar dados fora do Brasil.
          Nesses casos, a transferência internacional segue as hipóteses do art. 33 da LGPD.
        </p>
      </>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies',
    body: (
      <>
        <p>Usamos apenas cookies essenciais ao funcionamento do serviço:</p>
        <ul>
          <li>
            <strong>Cookie de sessão</strong>, que mantém você conectado por até 7 dias e é apagado
            quando você sai da conta.
          </li>
          <li>
            <strong>Cookie temporário do cadastro com Google</strong>, válido por 15 minutos, usado
            só para concluir o cadastro.
          </li>
        </ul>
        <p>Não usamos cookies de publicidade, de análise de audiência ou de terceiros.</p>
      </>
    ),
  },
  {
    id: 'retencao',
    title: 'Por quanto tempo guardamos',
    body: (
      <>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Dado</th>
                <th scope="col">Prazo</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dados da conta e dos anúncios</td>
                <td>Enquanto a conta existir; até 30 dias depois da exclusão</td>
              </tr>
              <tr>
                <td>Foto original enviada</td>
                <td>Até 24 horas</td>
              </tr>
              <tr>
                <td>Versões processadas das fotos</td>
                <td>Até 30 dias depois de o anúncio ser excluído</td>
              </tr>
              <tr>
                <td>Registros de acesso à aplicação</td>
                <td>6 meses (Marco Civil da Internet, art. 15)</td>
              </tr>
              <tr>
                <td>Auditoria de acesso ao contato e de moderação</td>
                <td>24 meses</td>
              </tr>
              <tr>
                <td>Registros financeiros do pagamento</td>
                <td>5 anos</td>
              </tr>
              <tr>
                <td>Relatórios de erro técnico</td>
                <td>30 dias</td>
              </tr>
              <tr>
                <td>Cópias de segurança</td>
                <td>Até 30 dias além do prazo do dado original</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Quando você exclui a conta, ela some do site imediatamente e os dados são apagados ou
          anonimizados em até 30 dias, exceto os que a lei nos obriga a guardar pelos prazos acima
          ou que sejam necessários para o exercício regular de direitos.
        </p>
      </>
    ),
  },
  {
    id: 'seguranca',
    title: 'Como protegemos seus dados',
    body: (
      <ul>
        <li>Conexão sempre criptografada (HTTPS).</li>
        <li>Senhas guardadas apenas como hash; nenhuma pessoa tem acesso à sua senha.</li>
        <li>Fotos em armazenamento privado, servidas só pelo próprio site.</li>
        <li>Contato liberado só à pessoa escolhida, com registro de cada acesso.</li>
        <li>Endereço IP fora da sessão e dados pessoais mascarados nos relatórios de erro.</li>
      </ul>
    ),
  },
  {
    id: 'direitos',
    title: 'Seus direitos',
    body: (
      <>
        <p>Pela LGPD (art. 18), você pode pedir a qualquer momento:</p>
        <ul>
          <li>confirmação de que tratamos seus dados e acesso a eles;</li>
          <li>correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>anonimização, bloqueio ou eliminação de dados desnecessários ou excessivos;</li>
          <li>portabilidade dos dados;</li>
          <li>eliminação dos dados tratados com o seu consentimento;</li>
          <li>informação sobre com quem compartilhamos seus dados;</li>
          <li>revisão de decisões tomadas apenas com base em tratamento automatizado;</li>
          <li>exclusão da sua conta.</li>
        </ul>
        <p>
          Para exercer qualquer desses direitos, escreva para {mail} a partir do e-mail cadastrado
          na sua conta. Podemos pedir uma confirmação para garantir que o pedido é seu, e
          respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de
          Dados (ANPD).
        </p>
      </>
    ),
  },
  {
    id: 'idade',
    title: 'Maiores de 18 anos',
    body: (
      <p>
        O TROQ é destinado apenas a maiores de 18 anos, que declaram essa condição no cadastro. Não
        coletamos intencionalmente dados de crianças ou adolescentes. Se identificarmos uma conta de
        menor de 18 anos, ela será encerrada.
      </p>
    ),
  },
  {
    id: 'alteracoes',
    title: 'Alterações desta política',
    body: (
      <p>
        Podemos atualizar esta política para refletir mudanças no serviço ou na lei. A versão e a
        data da última atualização ficam no topo desta página. Mudanças relevantes serão avisadas no
        site ou por e-mail antes de valer. Veja também os <Link href="/termos">Termos de Uso</Link>.
      </p>
    ),
  },
];

export default function PrivacidadePage() {
  return (
    <LegalDocument
      kicker="Privacidade"
      title="Política de Privacidade"
      summary={
        <>
          Pedimos só o necessário para você anunciar e trocar com segurança. Seu telefone nunca
          aparece no anúncio, não usamos rastreamento de publicidade e você pode pedir a exclusão
          dos seus dados quando quiser.
        </>
      }
      meta={[
        `Versão ${PRIVACY_POLICY_VERSION}`,
        `Atualizada em ${LEGAL_UPDATED_AT}`,
        `Controlador: ${LEGAL_CONTROLLER}`,
      ]}
      sections={sections}
    />
  );
}
