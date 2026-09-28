# Documento de Arquitetura: Contrato do Formulário e Consulta de Anúncios

Este documento especifica o design, contrato de dados e interface do usuário para a criação e consulta de anúncios (Issue #43 / F2-005), respeitando as restrições de privacidade e os requisitos do MVP.

## 1. Contrato de Dados (Listing Contract)

O anúncio é o modelo central do sistema. Os campos foram definidos para garantir a segurança do usuário e a simplicidade do MVP.

> [!IMPORTANT]
> **Privacidade de Localização:** A localização deve ser estritamente limitada a Cidade e Estado (UF). É terminantemente proibida a coleta, armazenamento ou exibição de CEP, bairro, endereço completo ou coordenadas GPS.

### 1.1. Campos do Anúncio (Listing)

| Campo | Tipo | Descrição | Regras de Validação | Visibilidade |
|---|---|---|---|---|
| `id` | UUID | Identificador único do anúncio | Gerado pelo backend | Público |
| `userId` | UUID | ID do proprietário do anúncio | Deve existir | Privado (ver Allowlist) |
| `title` | String | Título do anúncio | Min: 5, Max: 60 caracteres | Público |
| `description` | Text | Descrição detalhada do item | Max: 1000 caracteres | Público |
| `images` | Array<URL>| Imagens do item | Min: 1, Max: 5 imagens | Público |
| `city` | String | Cidade de origem do item | Requerido | Público |
| `state` | String (UF)| Estado de origem do item | Requerido (2 letras) | Público |
| `status` | Enum | Estado atual do anúncio | `DRAFT`, `PUBLISHED`, `INACTIVE` | Público (com restrições) |
| `createdAt` | DateTime | Data de criação | Gerado pelo sistema | Público |
| `updatedAt` | DateTime | Data da última atualização | Gerado pelo sistema | Público |
| `complianceAcceptedAt`| DateTime | Aceite do termo de itens proibidos| Requerido na publicação | Privado |
| `complianceVersion` | String | Versão do termo aceito | Requerido na publicação | Privado |

### 1.2. Allowlist de Exposição (Public vs Private)

Para proteger os usuários (RF-014), a API de listagem pública retornará estritamente os campos marcados como **Públicos**.

> [!WARNING]
> **Risco de Privacidade:** Sob nenhuma circunstância a API de anúncios (Listing) deve retornar dados privados do autor (telefone, WhatsApp, email) na resposta pública. A comunicação deve ser estritamente através do mecanismo interno da plataforma (se previsto no MVP) ou as informações de contato só devem ser trocadas mediante aceite mútuo (match).

**Retorno Público Esperado (DTO de Saída):**
```json
{
  "id": "uuid",
  "title": "Bicicleta Caloi Aro 29",
  "description": "Bicicleta em ótimo estado...",
  "images": ["url1", "url2"],
  "location": {
    "city": "São Paulo",
    "state": "SP"
  },
  "createdAt": "2023-10-24T12:00:00Z"
  // userId NÃO exportado, ou usar um alias/ID ofuscado se necessário para exibir o nome do dono.
}
```

## 2. Máquina de Estados e Ciclo de Vida do Anúncio

### 2.1. Estados Possíveis

1.  **Rascunho (Draft):** O usuário está preenchendo o formulário. Pode salvar e continuar depois. Campos incompletos são permitidos.
2.  **Publicado (Published):** O anúncio está visível na plataforma. Todos os campos obrigatórios e o aceite de conformidade foram preenchidos.
3.  **Inativo (Inactive):** O anúncio foi pausado pelo usuário ou o item foi trocado/vendido.

### 2.2. Aceite de Conformidade (Compliance)

Ao mudar o estado de `DRAFT` para `PUBLISHED`, o usuário deve explicitamente aceitar os Termos de Uso relativos a itens proibidos.

> [!IMPORTANT]
> O sistema deve registrar o `timestamp` exato e a `versão` do documento de conformidade aceito no momento da publicação.

## 3. Experiência do Usuário (UX) e Telas

O design deve seguir uma abordagem **Mobile-first** e atender aos critérios mínimos de acessibilidade (WCAG AA).

### 3.1. Tela de Criação/Edição de Anúncio (Formulário)

- **Upload de Imagens:** Permitir arrastar e soltar (desktop) ou seleção da câmera/galeria (mobile). Limite de 5 imagens.
- **Localização:** 
  - Dois selects em cascata (Estado -> Cidade) ou autocompletar baseado em lista pré-definida.
  - **Sem integração com APIs de CEP**.
- **Validação Inline:** Mensagens claras de erro em campos obrigatórios enquanto o usuário digita.
- **Botões de Ação:** "Salvar como Rascunho" e "Publicar Anúncio".

### 3.2. Consulta e Listagem (Feed)

O MVP define uma listagem simplificada. Funcionalidades de "busca avançada" estão fora de escopo.

- **Ordenação Disponível:**
  - Mais recentes (Padrão)
  - Mais antigos
- **Filtros Disponíveis:**
  - Localização (Estado e Cidade)
  - *Nota: Filtros por categoria ou texto complexo não fazem parte deste MVP inicial.*

### 3.3. Estados da Interface (UI States)

Todas as telas que lidam com listas ou carregamento de dados devem implementar:

- **Loading State:** Skeletons (esqueletos de interface) para cards de anúncio e spinners para o formulário.
- **Empty State:**
  - *Meus Anúncios:* "Você ainda não publicou nenhum item. [Criar meu primeiro anúncio]"
  - *Feed/Busca:* "Nenhum anúncio encontrado para esta região. Tente alterar os filtros."
- **Error State:**
  - *Formulário:* "Ocorreu um erro ao salvar seu rascunho. Tente novamente." (com opção de retry)
  - *Feed:* "Não foi possível carregar os anúncios no momento." (com botão de recarregar)

## 4. Critérios de Acessibilidade (a11y)

- Todos os campos de formulário devem possuir `<label>` associado de forma implícita ou explícita (atributo `for`).
- As imagens dos anúncios (quando enviadas) devem permitir ou gerar um `alt text` padrão (ex: "Imagem 1 do anúncio: [Título do Anúncio]").
- Suporte a navegação por teclado (`Tab`, `Enter`, `Space`) em toda a tela de listagem e formulário.
- Contraste adequado de cores, principalmente nos botões de ação e mensagens de erro (Error State).
