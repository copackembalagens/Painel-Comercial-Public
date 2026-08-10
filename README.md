# Painel Comercial Copack (público)

Este repositório hospeda **apenas o site** do painel comercial (via
Cloudflare Pages, conectado a este repositório no GitHub). Nenhum dado
sensível fica aqui em texto plano — a lógica de cálculo e os dados brutos
ficam no repositório privado
[Painel-Comercial-Private](https://github.com/copackembalagens/Painel-Comercial-Private),
que publica aqui apenas `site/dados/consolidado.json` (agregados já
calculados, sem detalhe de transação individual, sem CNPJ de cliente,
sem credencial).

## Estrutura

```
site/
  index.html          -> pagina inicial (aponta para a area de cada pessoa)
  assets/app.js        -> logica da Camada 3 (le consolidado.json e renderiza; nao calcula nada)
  assets/style.css      -> identidade visual (manual da marca CoPack)
  dados/consolidado.json -> atualizado automaticamente todo dia as 02h pelo repo Privado
  eduardo/, joice/, rubs/, geovana/, francyne/, gerencial/
                        -> uma pasta por area de acesso (Cloudflare Access
                           protege cada uma por e-mail permitido)
```

## Configuração no Cloudflare Pages

- Conectar este repositório.
- Build command: (nenhum — site 100% estático)
- Build output directory: `site`
- Depois do primeiro deploy, configurar o **Cloudflare Access** (Zero
  Trust → Access → Applications) criando uma aplicação "self-hosted" por
  área, apontando para `<seu-projeto>.pages.dev/eduardo/*`,
  `/joice/*`, `/rubs/*`, `/geovana/*`, `/francyne/*` e `/gerencial/*`,
  cada uma com a política de e-mail permitido correspondente. Sem domínio
  próprio — usa o subdomínio gratuito `*.pages.dev`.

## Status (10/08/2026)

Abas com dado real: **Comissão e Bonificação**, **Metas** (só total do
canal por enquanto) e **Performance Kommo**. Abas ainda pendentes no site
(aparecem como "ainda não disponível", sem número inventado): Retenção,
Reativação, Gratificação, auditoria de cliente novo/dono do cliente — ver
o README do repositório Privado para o motivo técnico de cada pendência.

`site/dados/consolidado.json` só é atualizado de verdade depois que o
secret `PUBLISH_TOKEN` for criado no repositório Privado (fine-grained PAT
com escrita neste repositório). Até lá, o arquivo fica com os valores
vazios do placeholder inicial.
