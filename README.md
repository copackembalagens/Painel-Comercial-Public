# Painel Comercial Copack (público)

Este repositório hospeda **apenas o site** do painel comercial, via
**GitHub Pages** (Settings → Pages → Deploy from branch → `main` → `/`
raiz). Nenhum dado sensível de verdade fica aqui — o repositório privado
[Painel-Comercial-Private](https://github.com/copackembalagens/Painel-Comercial-Private)
publica só `dados/consolidado_<area>.json`, e cada arquivo já vem
filtrado por área (a comissão de um vendedor não aparece no arquivo dos
outros — ver `calc/consolidar.py` no repo privado).

## Estrutura (na raiz, exigência do GitHub Pages)

```
index.html            -> pagina inicial (links para cada area)
assets/app.js          -> logica da Camada 3 (le o JSON da area e renderiza; nao calcula nada)
assets/style.css        -> identidade visual (manual da marca CoPack)
dados/consolidado_<area>.json -> atualizado automaticamente todo dia as 02h
eduardo/, joice/, rubs/, geovana/, francyne/, gerencial/
                        -> uma pasta por area; cada index.html carrega
                           assets/app.js com a config daquela area (abas
                           permitidas, hash da senha, qual arquivo de
                           dados ler)
```

## Acesso: senha por painel (não é Cloudflare Access)

GitHub Pages não tem login por e-mail. Cada área pede uma senha antes de
mostrar os dados — comparação feita por hash SHA-256 no navegador
(`assets/app.js`, função `montarTelaLogin`). **Isso não é autenticação
real**: qualquer pessoa com acesso ao código-fonte da página vê o hash,
e alguém que soubesse a URL exata do arquivo JSON de uma área pouparia a
tela de senha. Por isso a proteção de verdade está em **filtrar o dado
na origem**: o arquivo de cada vendedor só contém a comissão dele mesmo,
nunca a dos colegas — mesmo pulando a senha, não dá pra ver comissão
alheia. Se no futuro for necessário controle de acesso real (ex.: dados
de clientes, CNPJ), reavaliar Cloudflare Access ou GitHub Pages privado.

## Status (10/08/2026)

Abas com dado real: **Comissão e Bonificação**, **Metas** (só total do
canal por enquanto) e **Performance Kommo**. Abas ainda pendentes
(aparecem como "ainda não disponível", sem número inventado): Retenção,
Reativação, Gratificação, auditoria de cliente novo/dono do cliente — ver
o README do repositório Privado para o motivo técnico de cada pendência.

`dados/consolidado_<area>.json` só é atualizado de verdade depois que o
secret `PUBLISH_TOKEN` for criado no repositório Privado (fine-grained
PAT com escrita neste repositório). Até lá, os arquivos ficam com os
valores vazios do placeholder inicial.
