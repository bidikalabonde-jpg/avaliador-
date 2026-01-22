Avaliador de Curriculo x Vaga (GitHub Pages + OpenAI)

O que voce pediu (implementado):
- Upload de curriculo: PDF, DOCX, TXT (extraido no navegador).
- Vaga: colar texto OU buscar por URL (proxy CORS; pode falhar em alguns sites).
- Avaliacao heuristica com mais criterios (aderencia, requisitos, impacto/metricas, estrutura, clareza, tamanho, idioma).
- Relatorio com IA (OpenAI) exibido em texto no site.

IMPORTANTE (seguranca):
- Nao coloque sua chave OpenAI no JavaScript do navegador.
- Para IA, use o endpoint backend em /api/analyze (serverless) com OPENAI_API_KEY em variavel de ambiente.

Como rodar localmente (frontend):
- Abra index.html (funciona), ou use:
  python -m http.server 8000

Deploy recomendado:
1) Suba este repositorio no GitHub.
2) Frontend no GitHub Pages:
   - Settings -> Pages -> Deploy from a branch -> main -> /(root)
3) Backend (IA) no Vercel:
   - Importe o repo no Vercel
   - Configure Environment Variables:
     OPENAI_API_KEY = sua_chave
     (opcional) OPENAI_MODEL = gpt-4o-mini
   - Deploy
   - Copie a URL do endpoint:
     https://SEU-PROJETO.vercel.app/api/analyze
   - Cole essa URL no campo "Endpoint da API" no site.

Arquivos importantes:
- index.html, css/style.css, js/script.js (frontend)
- api/analyze.js (backend serverless para Vercel)
- vercel.json (config opcional)

Observacoes:
- PDFs escaneados (imagem) nao extraem texto bem. Prefira PDFs com texto selecionavel.
- Alguns sites bloqueiam extracao por URL. Quando falhar, copie e cole a vaga manualmente.
