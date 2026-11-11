# Nacional Marcenaria e Carpintaria

Site da Nacional Marcenaria e Carpintaria (Sorocaba - SP). HTML, CSS e JS puros, com servidor Node sem dependências.

## Rodar

```bash
node server.js
```

Abre em http://localhost:3002. Variáveis de ambiente opcionais: `PORT`, `ADMIN_TOKEN` e `WHATSAPP`.

## Estrutura

- `public/` — site estático
- `server.js` — arquivos estáticos, `POST /api/orcamento`, `GET /api/leads` (exige `ADMIN_TOKEN`)
- `data/leads.jsonl` — pedidos recebidos (fora do Git)

## WhatsApp

O número (15) 3223-2626 está em `WA` (`public/js/main.js`), nos links de `public/index.html` e no padrão de `WHATSAPP` em `server.js`.

## Antes de publicar

Trocar o domínio provisório `nacionalmarcenaria.com.br` em `public/index.html`, `public/sitemap.xml`, `public/robots.txt` e `public/llms.txt`.
