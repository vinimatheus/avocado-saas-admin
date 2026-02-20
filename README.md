# avocado-saas-admin

Painel administrativo global do SaaS (repo separado), conectado ao mesmo banco do app principal.

## Escopo MVP implementado

- Login próprio do admin app (Better Auth + Prisma)
- Bootstrap do primeiro `MASTER` em `/setup/claim-master`
- RBAC global `MASTER` e `ADMIN`
- Troca obrigatória de senha no primeiro login para admins criados por `MASTER`
- Módulos:
  - `/admin/empresas`
  - `/admin/usuarios`
  - `/admin/planos` (com compatibilidade via redirect de `/admin/pagamentos`)
  - `/admin/logs`
  - `/admin/admins` (somente `MASTER`)

## Ambiente

1. Copie variáveis:

```bash
cp .env.example .env
```

2. Gere o Prisma Client:

```bash
pnpm prisma:generate
```

3. Rode em desenvolvimento na porta separada (`3001`):

```bash
pnpm dev
```

Abra: [http://localhost:3001](http://localhost:3001)

## Segurança de setup e integração

- Configure `ADMIN_BOOTSTRAP_TOKEN` para proteger o claim do primeiro `MASTER`.
- Configure `ADMIN_STARTER_IMPERSONATION_SECRET` (mínimo 32 caracteres).
- O valor de `ADMIN_STARTER_IMPERSONATION_SECRET` precisa ser idêntico no `avocado-saas-starter`.

## Deploy

Produção planejada em subdomínio dedicado:

- `https://admin.seudominio.com`

Defina `BETTER_AUTH_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL` e `TRUSTED_ORIGINS` para esse domínio.
