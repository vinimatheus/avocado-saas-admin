# Avocado SaaS Admin - Contexto Operacional

## Contexto de Repositórios
- SaaS Starter (produto principal dos clientes): `/Users/viniciusmatheusmoreira/Desktop/projetos/avocado-saas-starter`
- SaaS Admin (painel do dono do SaaS): `/Users/viniciusmatheusmoreira/Desktop/projetos/avocado-saas-admin`

## Papel deste Projeto (Admin)
Este repositório é o painel administrativo central para o dono da plataforma gerenciar o SaaS Starter.

## Responsabilidades do Admin
- Gestão de empresas (tenants)
- Gestão de usuários
- Gestão de pagamentos, billing e status de assinatura
- Logs, auditoria e rastreabilidade
- Visibilidade operacional e controle da plataforma

## Regra de Trabalho Entre Admin e Starter
- Priorizar implementação no `avocado-saas-admin` quando a demanda for de controle e operação.
- Acessar o `avocado-saas-starter` quando a funcionalidade depender de integração, consistência de dados ou contratos compartilhados.
- Sempre deixar explícito em cada tarefa qual repositório será alterado.

## Diretriz para Novas Demandas no Admin
Ao iniciar qualquer feature, seguir esta ordem:
1. Definir objetivo de negócio (empresa, usuário, pagamento, log, etc.).
2. Mapear entidades e permissões envolvidas.
3. Validar impacto no Starter (API, dados, autenticação, billing).
4. Implementar no Admin com foco em gestão, segurança e auditoria.
5. Registrar claramente os impactos cruzados entre os dois projetos.

## Decisão Padrão
Se houver dúvida de escopo:
- Operação e controle da plataforma => `avocado-saas-admin`
- Experiência do cliente final no produto => `avocado-saas-starter`
