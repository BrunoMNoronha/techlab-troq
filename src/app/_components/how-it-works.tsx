import { Section } from '@/components/layout';
import { Prose } from '@/components/ui';

// Explicacao do fluxo central, derivada de docs/product/requirements.md
// (RF-009 a RF-015, RB-003, RB-004) e payment-exceptions.md (DEC-037). Nao
// promete liberacao imediata nem apresenta a solicitacao paga como operacional.
export function HowItWorks({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  return (
    <Section title="Como funciona o contato" titleId="como-funciona" headingLevel={headingLevel}>
      <Prose>
        <ol>
          <li>
            Ver as ofertas e os detalhes de cada anúncio é livre, sem login. Demonstrar interesse é
            gratuito e não libera o contato.
          </li>
          <li>
            Para pedir o contato do anunciante, é preciso entrar com uma conta de e-mail verificado
            e fazer uma <strong>solicitação paga de R$ 0,99</strong> via Pix.
          </li>
          <li>
            Cada anúncio aceita no máximo <strong>três solicitações pagas</strong>.
          </li>
          <li>
            O anunciante escolhe uma das solicitações pagas. Só a pessoa escolhida recebe o
            WhatsApp/telefone; pagar não garante ser escolhido.
          </li>
          <li>
            A cobrança é definitiva: não há reembolso por não ser escolhido. Só há reembolso técnico
            nas exceções previstas, como um pagamento que não pôde gerar uma solicitação válida.
          </li>
        </ol>
      </Prose>
    </Section>
  );
}
