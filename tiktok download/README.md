# TikTok No-Watermark Downloader (MVP v0.2)

Base de extensao para testes no Chrome/Edge:

- multi-selecao de videos (ate 30 por aba)
- selecao por clique na pagina do TikTok
- importacao de videos visiveis (perfil, explorar e For You)
- download em lote sem marca d'agua
- opcao de download em MP3 (audio) ou MP4 (video)
- tentativa de resolver link sem marca d'agua via API externa

## Como testar

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactacao`.
4. Selecione esta pasta:
   - `C:\Users\augus\Documents\Codex\2026-05-21\quero-criar-uma-extens-o-onde`
5. Abra um video no TikTok em `https://www.tiktok.com/...`.
6. Clique no icone da extensao.
7. Use uma das formas de adicionar videos:
   - `Selecao por clique` e clique em varios videos (use `ESC` para sair desse modo)
   - `Importar visiveis` para puxar os videos do feed atual
8. Marque os videos desejados na lista.
9. Escolha o `Formato de download` (MP3 ou MP4).
10. Clique em `Baixar marcados`.

## Observacoes

- Este MVP usa resolvers publicos:
  - `https://www.tikwm.com/api/`
  - `https://api.tiklydown.eu.org/api/download/v4`
- Esses servicos podem falhar, mudar formato de resposta ou bloquear requisicoes.
- Para algo estavel em producao, o ideal e ter um backend proprio/adaptadores com monitoramento.
- O modo `For You` no TikTok web pode mudar o DOM sem aviso. Nesta versao foram adicionadas heuristicas extras para capturar links nesses casos.

## Arquivos principais

- `manifest.json`: configuracao da extensao
- `content.js`: selecao por clique + varredura de videos visiveis
- `popup.html`, `popup.css`, `popup.js`: interface da extensao
- `background.js`: estado multi-selecao, resolucao de URL sem marca d'agua e download em lote

## Aviso de uso

Use somente com videos proprios ou com autorizacao. Plataformas podem ter termos especificos sobre download e redistribuicao.
