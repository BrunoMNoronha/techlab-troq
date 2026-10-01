import { describe, expect, it } from 'vitest';
import { normalizeBrazilianPhone } from './phone';

// DM-4.5: formato canonico E.164 brasileiro. Numeros sinteticos (PD-13.3).
describe('normalizeBrazilianPhone — E.164 brasileiro (DM-4.5)', () => {
  it.each([
    ['11912345678', '+5511912345678'],
    ['(11) 91234-5678', '+5511912345678'],
    ['11 9 1234 5678', '+5511912345678'],
    ['11.91234.5678', '+5511912345678'],
    ['+55 (11) 91234-5678', '+5511912345678'],
    ['5511912345678', '+5511912345678'],
    ['55 11 91234-5678', '+5511912345678'],
    ['  (81) 99876-5432  ', '+5581998765432'],
    ['(55) 91234-5678', '+5555912345678'],
    ['5555912345678', '+5555912345678'],
  ])('celular %j vira %s', (raw, e164) => {
    expect(normalizeBrazilianPhone(raw)).toEqual({ ok: true, e164 });
  });

  it.each([
    ['(11) 2345-6789', '+551123456789'],
    ['(21) 3456-7890', '+552134567890'],
    ['(31) 4567-8901', '+553145678901'],
    ['(41) 5678-9012', '+554156789012'],
    ['+55 61 3456-7890', '+556134567890'],
    ['556134567890', '+556134567890'],
    ['(55) 3456-7890', '+555534567890'],
  ])('fixo %j vira %s', (raw, e164) => {
    expect(normalizeBrazilianPhone(raw)).toEqual({ ok: true, e164 });
  });

  it.each(['', '   ', undefined, null, 11912345678])('vazio ou nao texto (%j)', (raw) => {
    expect(normalizeBrazilianPhone(raw)).toEqual({ ok: false, empty: true });
  });

  it.each([
    ['DDD com 0 no primeiro digito', '(01) 91234-5678'],
    ['DDD com 0 no segundo digito', '(10) 91234-5678'],
    ['celular sem o 9 inicial', '(11) 81234-5678'],
    ['celular de 9 digitos sem o 9 inicial', '(11) 12345-6789'],
    ['fixo comecando por 6', '(11) 6234-5678'],
    ['fixo comecando por 7', '(11) 7234-5678'],
    ['fixo comecando por 8', '(11) 8234-5678'],
    ['fixo comecando por 9', '(11) 9234-5678'],
    ['fixo comecando por 1', '(11) 1234-5678'],
    ['sem DDD', '91234-5678'],
    ['digito a mais', '(11) 912345-6789'],
    ['digito a menos', '(11) 91234-567'],
    ['letras', '(11) 9123A-5678'],
    ['WhatsApp por extenso', 'whatsapp 11912345678'],
    ['DDI estrangeiro', '+1 415 555 0100'],
    ['DDI estrangeiro com 13 digitos', '+44 7911 123456'],
    ['mais sem DDI', '+11912345678'],
    ['mais no meio', '11+912345678'],
    ['prefixo de operadora', '0 11 91234-5678'],
    ['zero de tronco com DDI', '+55 0 11 91234-5678'],
    ['barra', '11/91234-5678'],
    ['muito longo', '1'.repeat(40)],
  ])('recusa %s', (_case, raw) => {
    expect(normalizeBrazilianPhone(raw)).toEqual({ ok: false, empty: false });
  });

  it('a recusa nao carrega a entrada (CR-2.5 item 2)', () => {
    const result = normalizeBrazilianPhone('(11) 6234-5678');
    expect(JSON.stringify(result)).not.toMatch(/\d/);
  });
});
