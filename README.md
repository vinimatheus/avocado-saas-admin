# avocado-saas-admin

Painel administrativo global da plataforma Avocado SaaS.  
Este projeto concentra operacao, governanca, seguranca e auditoria do ecossistema multi-tenant.

## Repositorio relacionado (obrigatorio neste contexto)

- SaaS Starter (produto dos clientes): [avocado-saas-starter](https://github.com/vinimatheus/avocado-saas-starter)
- Caminho local Starter: `/Users/viniciusmatheusmoreira/Desktop/projetos/avocado-saas-starter`
- Caminho local Admin: `/Users/viniciusmatheusmoreira/Desktop/projetos/avocado-saas-admin`

## Contexto multi-repo

| Repositorio | Papel | Quando alterar |
| --- | --- | --- |
| `avocado-saas-admin` | Controle e operacao da plataforma | Gestao de tenants, usuarios, billing operacional, logs, RBAC global |
| `avocado-saas-starter` | Experiencia do cliente final | Fluxos do produto final, onboarding, dashboard, uso diario do tenant |

Regra padrao de escopo:

- Operacao e controle da plataforma -> `avocado-saas-admin`
- Experiencia do cliente final -> `avocado-saas-starter`

## Objetivo de negocio do Admin

- Gestao de empresas (tenants) em nivel de plataforma
- Gestao de usuarios e administradores globais
- Operacoes de assinatura, plano, cobranca e webhooks
- Auditoria centralizada com trilha de eventos
- Acesso seguro cross-app do Admin para o Starter (impersonation)

## Escopo implementado

### 1. Acesso administrativo e seguranca

- Login proprio do Admin via Better Auth + Prisma
- Setup inicial do primeiro `MASTER` em `/setup/claim-master`
- Fluxo de bootstrap token (`ADMIN_BOOTSTRAP_TOKEN`) para proteger setup inicial
- RBAC global com papeis:
  - `MASTER`: controle total, incluindo criacao de admins e impersonation cross-app
  - `ADMIN`: operacao diaria, sem privilegios de master
- Troca obrigatoria de senha para admins criados com senha temporaria

### 2. Gestao de empresas (tenants)

- Listagem paginada com busca por nome/slug
- Bloqueio e desbloqueio de tenant com motivo
- Visualizacao detalhada por tenant:
  - membros, convites, produtos
  - status da plataforma
  - assinatura/plano atual
  - eventos recentes da empresa
- Acesso seguro para abrir sessao no Starter como owner da empresa (somente `MASTER`)

### 3. Gestao de usuarios

- Busca por nome/e-mail
- Bloqueio e desbloqueio com motivo
- Encerramento forcado de sessoes
- Tela de detalhe do usuario:
  - sessoes recentes
  - memberships em organizacoes
  - papel global (quando admin)
  - eventos recentes relacionados

### 4. Billing e planos (operacao)

- Gestao de plano por organizacao:
  - aplicar plano manualmente
  - downgrade para plano anterior
  - remover plano e retornar para `FREE`
- Concessao de plano gratuito temporario (cortesia) com meses definidos
- Sincronizacao de checkouts -> invoices
- Reprocessamento manual de webhooks `FAILED`/`IGNORED` (AbacatePay)

### 5. Auditoria e rastreabilidade

- Registro de eventos de plataforma (`platform_event_log`) para:
  - acoes de admin
  - eventos de auth
  - operacoes de billing
  - impersonation cross-app
- Modulo `/admin/logs` com:
  - filtros por fonte, acao, tenant e periodo
  - agrupamento por dia e fonte
  - visualizacao de metadata JSON

### 6. Dashboard operacional

- Cards consolidados com metricas de:
  - empresas (incluindo bloqueadas)
  - usuarios (incluindo bloqueados)
  - admins ativos
  - assinaturas ativas
  - webhooks com falha/ignorado

## Stack tecnica

- Next.js 16 (App Router)
- React 19 + TypeScript 5
- Better Auth
- Prisma ORM + PostgreSQL
- Tailwind CSS 4
- Zod (validacao de server actions)

## Modelo de dados (resumo)

Este projeto compartilha schema com o Starter (mesmo `DATABASE_URL`).

Principais entidades de plataforma:

- `platform_admin` (`MASTER`/`ADMIN`, status, `mustChangePassword`)
- `platform_event_log` (auditoria)
- `organization` (status de plataforma, bloqueio, relacao com assinatura)
- `user` (status de plataforma, relacoes de sessao e membership)

Principais entidades de billing:

- `owner_subscription`
- `billing_checkout_session`
- `billing_invoice`
- `billing_webhook_event`
- `subscription_cancellation_feedback`
- `owner_feature_override`
- `feature_rollout`
- `owner_monthly_usage`

## Integracao com avocado-saas-starter

### Contratos compartilhados

1. Banco compartilhado
- Admin e Starter operam sobre o mesmo PostgreSQL.
- Migrations e schema precisam permanecer consistentes nos dois repositorios.

2. Segredo compartilhado de impersonation
- Variavel obrigatoria nos dois projetos:
  - `ADMIN_STARTER_IMPERSONATION_SECRET`
- Requisito: minimo 32 caracteres e valor identico em Admin e Starter.

3. Endpoint cross-app
- Admin gera token assinado e envia para Starter:
  - Admin: `POST /api/starter/impersonate`
  - Starter: `POST /api/platform-admin/impersonation`

4. Trusted origins
- O Starter valida origem/referer do request de impersonation.
- Em ambiente local, inclua `http://localhost:3001` (Admin) no `TRUSTED_ORIGINS` do Starter.
- Em producao, inclua dominio do Admin no `TRUSTED_ORIGINS` do Starter.

### Fluxo resumido de impersonation (Admin -> Starter)

1. Admin `MASTER` inicia acao "Ir para empresa" no tenant.
2. Admin valida sessao, papel, status e tenant.
3. Admin cria token curto assinado (HMAC SHA-256).
4. Admin faz auto-post para o endpoint do Starter.
5. Starter valida assinatura, TTL, uso unico e ownership do tenant.
6. Starter cria sessao do owner da empresa e redireciona para `/dashboard`.

## Setup local

### Pre-requisitos

- Node.js 20+
- pnpm 9+ (ou npm)
- PostgreSQL disponivel localmente
- Recomendado: Starter rodando junto para testar fluxo cross-app

### 1) Instalar dependencias

```bash
pnpm install
```

### 2) Configurar ambiente

```bash
cp .env.example .env
```

Preencha obrigatoriamente:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `TRUSTED_ORIGINS`
- `STARTER_APP_URL`
- `ADMIN_STARTER_IMPERSONATION_SECRET`
- `ADMIN_BOOTSTRAP_TOKEN` (fortemente recomendado; obrigatorio em producao)

### 3) Prisma

Gerar client:

```bash
pnpm prisma:generate
```

Aplicar schema no banco local (se necessario):

```bash
pnpm prisma:push
```

Em ambientes com migracoes controladas:

```bash
pnpm prisma:migrate:deploy
```

### 4) Subir aplicacao

```bash
pnpm dev
```

Admin local: [http://localhost:3001](http://localhost:3001)

## Variaveis de ambiente (Admin)

Arquivo base: `.env.example`

| Variavel | Obrigatoria | Uso |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Banco PostgreSQL compartilhado com Starter |
| `BETTER_AUTH_SECRET` | Sim (producao) | Segredo do Better Auth |
| `BETTER_AUTH_URL` | Sim | URL base do Admin Auth (ex.: `http://localhost:3001`) |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Sim | URL publica do Auth client |
| `TRUSTED_ORIGINS` | Sim | Origens permitidas para auth |
| `BETTER_AUTH_COOKIE_PREFIX` | Recomendado | Prefixo de cookie do Admin |
| `STARTER_APP_URL` | Sim para cross-app | Base URL do Starter (ex.: `http://localhost:3000`) |
| `ADMIN_STARTER_IMPERSONATION_SECRET` | Sim para cross-app | Segredo compartilhado com Starter |
| `ADMIN_BOOTSTRAP_TOKEN` | Recomendado | Token de setup do primeiro MASTER |
| `ADMIN_APP_NAME` | Opcional | Reservado para customizacao de nome |
| `ADMIN_REQUIRE_2FA` | Opcional | Reservado (nao aplicado no fluxo atual) |

## Scripts disponiveis

| Script | Descricao |
| --- | --- |
| `pnpm dev` | Sobe Next em `3001` (com `prisma generate` no predev) |
| `pnpm build` | Gera Prisma Client e build de producao |
| `pnpm start` | Sobe build em `3001` |
| `pnpm lint` | Executa ESLint |
| `pnpm prisma:generate` | Gera Prisma Client |
| `pnpm prisma:push` | Aplica schema no banco |
| `pnpm prisma:migrate:deploy` | Aplica migracoes de producao |

## Rotas principais

Publicas/auth:

- `/`
- `/sign-in`
- `/setup/claim-master`
- `/change-password`

Admin:

- `/admin` (dashboard)
- `/admin/empresas`
- `/admin/empresas/[id]`
- `/admin/usuarios`
- `/admin/usuarios/[id]`
- `/admin/planos`
- `/admin/pagamentos` (redirect para `/admin/planos`)
- `/admin/logs`
- `/admin/admins` (somente MASTER)

APIs:

- `/api/auth/[...all]` (Better Auth handler)
- `/api/starter/impersonate` (handoff seguro Admin -> Starter)

## Fluxos operacionais criticos

### Setup inicial do primeiro MASTER

1. Acesse `/setup/claim-master`
2. Informe nome, e-mail e senha
3. Informe bootstrap token (quando exigido)
4. Sistema cria usuario + `platform_admin` com papel `MASTER`

### Bloqueio de tenant

1. Definir motivo
2. Alterar `platform_status` para `BLOCKED`
3. Registrar evento de auditoria
4. Impedir acesso cross-app para esse tenant

### Bloqueio de usuario

1. Definir motivo
2. Alterar `platform_status` para `BLOCKED`
3. Revogar sessoes do usuario
4. Registrar evento de auditoria

### Operacao de plano e webhook

1. Aplicar plano/downgrade/remocao/cortesia
2. Revalidar telas operacionais
3. Registrar evento de billing
4. Reprocessar webhook falho quando necessario

## Estrutura do projeto

```text
src/
  app/
    admin/
      admins/
      empresas/
      logs/
      pagamentos/
      planos/
      usuarios/
    api/
      auth/[...all]/
      starter/impersonate/
    change-password/
    setup/claim-master/
    sign-in/
  actions/
    admin-actions.ts
  components/
    admin/
    auth/
    ui/
  lib/
    admin/
    auth/
    billing/
    db/
    platform/
    starter/
prisma/
  schema.prisma
  migrations/
```

## Deploy (resumo)

Checklist minimo:

1. Definir dominio dedicado para Admin (ex.: `https://admin.seudominio.com`)
2. Configurar no Admin:
   - `BETTER_AUTH_URL`
   - `NEXT_PUBLIC_BETTER_AUTH_URL`
   - `TRUSTED_ORIGINS`
3. Garantir `ADMIN_STARTER_IMPERSONATION_SECRET` igual ao Starter
4. No Starter, incluir origem do Admin em `TRUSTED_ORIGINS`
5. Aplicar migracoes com controle (evitar drift entre Admin e Starter)

## Impactos cruzados (Admin x Starter)

Sempre validar este checklist quando houver mudanca em:

- schema Prisma compartilhado
- regras de assinatura/cobranca
- campos de status de plataforma (org/user/admin)
- contratos de impersonation
- trusted origins entre dominios

Se houver alteracao em um desses pontos, documente no PR:

- repositorio alterado
- contrato impactado no outro repositorio
- plano de rollout (ordem de deploy e migracoes)

## Troubleshooting rapido

- Erro no claim master:
  - valide `ADMIN_BOOTSTRAP_TOKEN` e se ja existe admin no banco
- Login falhando para usuario bloqueado:
  - verifique `user.platform_status` e logs `auth.login.blocked`
- Impersonation redireciona para sign-in do Starter:
  - valide segredo compartilhado
  - valide `TRUSTED_ORIGINS` no Starter contendo origem do Admin
  - valide se actor e `MASTER` ativo e tenant nao esta bloqueado
- Webhook nao reprocessa:
  - confirme status `FAILED` ou `IGNORED`
  - confirme mapeamento do evento para checkout outcome

## Licenca

Uso interno/proprietario (ajuste conforme politica do seu time).
