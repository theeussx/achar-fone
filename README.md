# 🎧 Achar meu fone

Localizador de fones Bluetooth perdidos que roda no navegador do celular. Lê a intensidade do sinal (RSSI) que o fone transmite e indica, em tempo real, se você está ficando mais perto ou mais longe, com bipe e vibração que aceleram na aproximação.

Sem backend, sem dependências de execução, sem build: HTML, CSS e JavaScript puro (módulos ES), hospedável como site estático.

## Recursos

- Medidor circular com estados: muito longe, longe, perto, muito perto, está aqui
- Bipe e vibração proporcionais à proximidade (cada um pode ser desligado)
- Gráfico do histórico recente do sinal e distância **estimada**
- Filtro por nome do aparelho, salvo no navegador
- Botão para parar a busca, que libera áudio, tela ativa e escuta Bluetooth
- Aviso claro quando o sinal é perdido e retomada automática quando volta
- Tela ativa durante a busca (Wake Lock, quando disponível)
- Instalável como PWA e utilizável offline; atualiza sozinho quando há internet
- Tema claro/escuro, navegação por teclado, rótulos para leitores de tela e suporte a movimento reduzido

## Requisitos

- Chrome no **Android** com suporte a `watchAdvertisements` (se faltar, ative `chrome://flags/#enable-experimental-web-platform-features`)
- Bluetooth e Localização ligados
- Página servida por **HTTPS** ou `localhost`
- Aberta direto no navegador: iframes e alguns apps embutidos bloqueiam a permissão `bluetooth`

Não funciona no iOS (Safari não suporta Web Bluetooth).

## Como usar

1. Abra a caixinha do fone ou coloque-o em modo de pareamento.
2. Informe parte do nome do fone (ex.: `GM2`). Deixe vazio para listar todos. O apelido que você deu no celular pode não ser o nome que o fone transmite.
3. Toque em **Escolher o fone** e selecione o aparelho.
4. Ande pelo ambiente e acompanhe o medidor. Toque em **Parar busca** ao terminar.

## Executar localmente

```bash
npm start        # ou: python3 -m http.server 8080
# abra http://localhost:8080 no Chrome
```

No Termux funciona do mesmo jeito (`python -m http.server 8080`).

## Publicar

Qualquer hospedagem estática serve (Vercel, GitHub Pages, Netlify): publique a raiz do repositório. Ao adicionar ou remover arquivos de `FILES` em `sw.js`, aumente `VERSION` para renovar o cache.

## Testes

```bash
npm test         # node --test (Node 18+), sem instalar nada
```

Cobrem a lógica de sinal (`src/signal.js`) e verificações de consistência do projeto: arquivos do cache existem, manifest válido, ids usados no JS existem no HTML. A parte Bluetooth precisa de um aparelho real e deve ser testada no celular. O CI (`.github/workflows/ci.yml`) roda a verificação de sintaxe e os testes a cada push.

## Estrutura

```
index.html              interface
style.css               estilos, tema e acessibilidade
src/signal.js           lógica pura: suavização, proximidade, distância, filtros
src/app.js              estado da busca, Bluetooth, áudio, vibração, Wake Lock
sw.js                   service worker (rede primeiro, cache offline)
manifest.webmanifest    instalação como app
icon.svg, icon-maskable.svg
test/                   testes
```

## Limitações

- Só encontra aparelhos que estejam transmitindo sinal: fone na caixa fechada, desligado ou sem bateria não aparece.
- RSSI oscila com paredes, corpo e interferência. A distância mostrada é uma estimativa com valores genéricos, não uma medida nem uma localização exata.
- Os ícones são SVG. Se o Chrome não oferecer a instalação, adicione ícones PNG de 192 e 512 px ao manifest.
- Em segundo plano o navegador pode reduzir a frequência dos bipes; mantenha a tela ativa.

## Licença

MIT. Veja [LICENSE](LICENSE).
