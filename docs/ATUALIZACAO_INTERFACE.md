# Atualização da interface (Expo SDK 57)

Reconstrução da interface do app para ficar fiel aos 14 mockups
(`guiamobi-tela-01` a `guiamobi-tela-14`), com acessibilidade real e ajustes
na API. Este documento diz o que mudou e, principalmente, **o que foi e o que
não foi verificado**.

## O que mudou no app (mobile)

- **Expo SDK 57** (React Native 0.86, React 19). O `babel.config.js` foi
  removido: com o `package.json` atual o `babel-preset-expo` fica dentro de
  `node_modules/expo/node_modules` e o arquivo não o encontrava; o Expo usa o
  preset padrão sozinho.
- **Sem emojis como ícones**: ícones vetoriais (`lucide-react-native`) e
  avatares desenhados em SVG. Fonte Nunito, como nos mockups.
- **Telas** (uma por mockup): abertura, login, cadastro, recuperação e
  redefinição de senha, início, busca de endereço, rotas encontradas,
  detalhes da linha, acompanhamento, alerta de parada, chegada, favoritos
  (+ adicionar local), histórico, configurações, Modo Simples, ajuda, editar
  perfil e tutorial.
- **Cores**: paleta extraída dos mockups e ajustada para contraste mínimo
  WCAG 2.1 AA (texto normal 4,5:1). Alto contraste e modo escuro mantidos.
- **Origem/destino** nunca aceitam texto livre: o usuário abre a busca,
  digita, toca em **Buscar** e escolhe um resultado real (com latitude e
  longitude). Não há consulta a cada tecla.
- **Feedback**: "Voz ativada" e "Vibração ativada" combinam nos quatro modos
  (voz, vibração, ambos, nenhum). **Testar feedback** executa exatamente o
  modo escolhido e fica desativado no modo "nenhum".
- **Modo Simples** muda a interface de fato: sem barra de abas, até 4 destinos
  grandes (favoritos) e "Falar o destino". Sai pelo selo "SIMPLES" ou pelo
  link do rodapé.
- **Acompanhamento da viagem** usa o GPS do aparelho comparado às paradas
  reais da linha (próxima parada, paradas restantes, distância ao destino).
  Alerta "Prepare-se!" a ~200 m do destino e chegada a ~40 m. **Não há
  posição do ônibus em tempo real** (não existe fonte de dados da frota).
- **Mapa** é esquemático: desenhado com as coordenadas reais das paradas, não
  é um mapa de ruas.
- **Avatares**: 12 opções visuais, cada uma com descrição para leitor de tela.
  Os que lembram bengalas são apenas opções; nenhum indica condição.
- **Tutorial** abre sozinho no primeiro acesso após o cadastro e continua em
  Configurações. Fala o passo sozinho só se a voz estiver ativa e não houver
  leitor de tela ligado.
- **Ajuda**: o e-mail e o telefone de contato só aparecem se configurados em
  `mobile/.env` (`EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_SUPPORT_PHONE`).

## O que mudou na API

| Rota | O que faz |
|------|-----------|
| `GET /geocode/search?q=` | Busca de endereços via Nominatim, intermediada pela API. |
| `GET /transit/status` | Quantas linhas/paradas existem e de que fonte. |
| `PATCH /users/me` | Edita nome, e-mail, senha e avatar. |

- **Busca de endereços**: fila com no máximo ~1 consulta por segundo ao
  Nominatim, `User-Agent` identificado (`GEOCODING_CONTACT`), cache de 1 hora
  e limite de 15 buscas por minuto por usuário. Prioriza o Vale do Paraíba sem
  excluir o resto do Brasil.
- **Recuperação de senha**: envio SMTP real com `nodemailer`. Sem SMTP
  configurado, em produção a API mantém uma resposta genérica, sem confirmar se a conta existe; a falha fica apenas no log do servidor; em
  desenvolvimento o conteúdo do e-mail só aparece no log do servidor. O e-mail
  traz o link `guiamobi://redefinir-senha?token=...` **e** o código em texto,
  para uso em "Já tenho um código".
- **Banco**: novo campo `avatar_id` em `users`. Rode
  `npx prisma migrate dev --name add_avatar`.

## O que foi verificado

- `tsc --noEmit` sem erros no app e na API.
- O app compila para web (`expo export`) e o fluxo completo foi percorrido em
  um navegador (react-native-web + Playwright, com a API simulada): abertura,
  login, cadastro, busca de endereço, rotas, detalhes, acompanhamento com GPS
  simulado, alerta, chegada, favoritos, histórico, configurações, ajuda,
  editar perfil, tutorial e Modo Simples. Cada tela foi comparada lado a lado
  com o mockup e as diferenças relevantes foram corrigidas.
- API: mapeamento dos resultados, cache, intervalo entre consultas, limite por
  usuário e o comportamento do envio de e-mail sem SMTP (desenvolvimento e
  produção) foram executados contra um Nominatim falso local.

## O que NÃO foi verificado (precisa de dispositivo e serviços reais)

- Voz, vibração, GPS e leitores de tela (TalkBack/VoiceOver) em aparelho real.
  Os atributos de acessibilidade estão nos componentes, mas a experiência com
  leitor de tela precisa ser testada por pessoas.
- API contra um PostgreSQL real, envio SMTP real e Nominatim público real.
- Compilação nativa (Android/iOS) e o Expo Go.

## Diferenças conscientes em relação aos mockups

- O botão do alerta de parada usa um âmbar um pouco mais escuro para manter
  contraste com o texto branco.
- Os horários por parada (ex.: 14:35) só aparecem quando a fonte de dados
  tiver horários; hoje mostram "N min". Nada é inventado.
- O selo "Ao vivo" do mockup virou "GPS do aparelho".
- Os números das linhas usam 3 cores fixas (azul, verde, roxo), como nos
  mockups.

## Pendências

1. Dados oficiais de linhas (GTFS): hoje há só as linhas de demonstração do
   `seed`. `/transit/status` informa isso ao app.
2. Posição do ônibus em tempo real (depende de dados da frota).
3. Reconhecimento de fala nativo: o microfone foca o campo e o usuário usa o
   ditado do teclado do sistema.
4. Testes em dispositivo real e com pessoas usuárias de tecnologia assistiva.
