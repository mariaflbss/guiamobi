# Revisão pós-Sprint 1

Este documento registra a revisão feita sobre o código já existente das
US01, US03, US05, US07 e US08, corrigindo bugs reais encontrados e
completando fluxos que estavam apenas parcialmente implementados.

**Nenhuma tecnologia fora da lista combinada foi adicionada.** A única
adição foi um novo módulo (`routes`) na própria API, seguindo o mesmo
padrão dos módulos existentes, e três modelos novos no Prisma - não é uma
tecnologia nova, é uso da mesma stack (Fastify + Prisma + Postgres) para um
dado que "realmente precisa de servidor", como já previa a arquitetura.

## Diagnóstico (antes de qualquer correção)

Bugs confirmados por leitura do código, não por suposição:

1. Em `HomeScreen`, ao selecionar uma sugestão de endereço, o `useEffect`
   que observa o texto do campo disparava uma nova busca imediatamente
   (o texto do campo mudava para o valor selecionado), reabrindo a lista de
   sugestões sozinha.
2. Em `FavoritesScreen`, a busca de endereço disparava uma chamada à API do
   Nominatim a cada tecla digitada, sem debounce (risco de bloqueio por
   limite de uso e UI "piscando" sugestões).
3. A preferência "Modo Simples" existia como um `switch` em Configurações,
   mas nenhuma tela lia esse valor - ligar ou desligar não mudava nada.
4. Não existia nenhuma tela de busca/exibição de rotas. O botão
   "Encontrar rota" apenas gravava a busca no histórico e mostrava um texto
   de confirmação.
5. `HistoryScreen` exibia os itens do histórico, mas nenhum deles era
   tocável - não era possível reabrir uma pesquisa anterior.
6. O fluxo de recuperação de senha **parava no envio do e-mail**: a API
   gerava e "enviava" (via log) um link `guiamobi://redefinir-senha?token=`,
   mas o app não tinha nenhuma tela para receber esse link nem para
   efetivamente trocar a senha. `app.json` declarava o `scheme`, mas
   `NavigationContainer` nunca foi configurado para escutá-lo.
7. Erros de validação de formulário (campo vazio, senha curta, e-mails
   inválidos) eram exibidos em texto, mas nunca chamavam `announce()` -
   só os erros vindos da API eram anunciados por voz/vibração.

## Prioridade 1 — Origem, destino e rotas

**Corrigido:**
- Bug da reabertura de sugestões: adicionado um "flag" (`skipNextSearch`)
  que pula a busca automática logo após uma seleção manual.
- Fluxo origem → destino: os campos continuam funcionando por texto (com
  sugestões reais via Nominatim/OpenStreetMap, já existente) e por GPS
  (`useCurrentLocation`).
- Entrada por voz **preparada e funcional dentro do que a stack permite**
  (ver nota abaixo).
- **Cálculo/exibição de rotas implementado de verdade**, não apenas a UI:
  - Novos modelos Prisma `TransitLine`, `TransitStop`, `LineStop`.
  - Script de seed (`api/prisma/seed/seed.ts`) com duas linhas reais
    (301 e 315, as mesmas dos mockups), com paradas geolocalizadas.
  - Novo módulo `routes` na API: algoritmo real (não simulado) que calcula
    a distância de Haversine entre o ponto informado e cada parada de cada
    linha, escolhe a parada mais próxima da origem e do destino (dentro de
    um raio caminhável de 1,2 km), garante que o embarque vem antes do
    desembarque na sequência da linha, estima a duração pela diferença de
    tempo cadastrada entre as paradas e ordena por duração.
  - Telas novas `RoutesFoundScreen` (lista as linhas encontradas, com a
    mais rápida destacada) e `RouteDetailScreen` (lista as paradas em
    ordem).
- **Histórico e favoritos agora só são integrados depois que a busca
  acontece de verdade**: o registro no histórico passou de "ao preencher
  os dois campos" para "ao chegar em `RoutesFoundScreen`" - ou seja, depois
  que a pesquisa de fato ocorreu.

**Nota honesta sobre voz nos campos de origem/destino:** o projeto usa
apenas `expo-speech`, que é texto-em-voz (TTS), não voz-em-texto (STT). Não
há nenhuma biblioteca de reconhecimento de fala na lista de tecnologias
definidas, e adicionar uma seria contrariar a instrução de não incluir
tecnologias fora do combinado. A solução implementada usa um recurso real
que já existe em todo teclado iOS/Android: o ícone de microfone do próprio
teclado do sistema, que faz ditado de verdade. O botão de microfone do app
(`MicrophoneButton`) foca o campo certo e orienta por voz o usuário a tocar
nesse ícone do teclado. Isso funciona de verdade (o teclado do sistema
realmente transcreve a fala), mas o app não tem como interceptar esse
texto além do que já recebe via `onChangeText` normal do campo.

## Prioridade 2 — Voz e acessibilidade

**Corrigido:**
- Mensagens importantes e erros de validação agora são sempre anunciados
  por voz/vibração (`announce()`), inclusive os que antes só apareciam em
  texto (Login, Cadastro, Esqueci senha, Favoritos, Redefinir senha).
- Vibração: `AccessibleButton` agora vibra de forma leve e consistente em
  toda ação (antes só ações específicas chamavam vibração manualmente),
  respeitando a preferência de feedback do usuário.
- **Modo Simples agora realmente modifica a interface**: quando ativado em
  Configurações, a tela inicial passa a mostrar atalhos grandes para os
  favoritos + botão "Falar destino", em vez do formulário detalhado (fiel
  ao mockup correspondente).
- Microfone implementado nos campos de origem e destino da Home (ver nota
  da Prioridade 1).
- Confirmação por voz do valor definido: toda vez que origem ou destino é
  definido - por GPS, por seleção de sugestão ou por favorito - o app
  anuncia por voz o valor confirmado.
- Compatibilidade com leitor de tela reforçada nas telas novas e revisadas
  (roles, labels, hints, grupos de acessibilidade em vez de textos soltos).

## Prioridade 3 — Favoritos e histórico

**Corrigido:**
- Favoritos: busca de endereço com debounce (o bug de spam na API foi
  corrigido); erros de validação agora anunciados; cada favorito é lido
  pelo leitor de tela como um bloco único (apelido + endereço), com o
  botão de excluir separado.
- Histórico: itens agora são tocáveis e reabrem a busca (`RoutesFound` com
  a mesma origem/destino); acessibilidade reforçada (`accessibilityRole`,
  `accessibilityHint`); mantidas as últimas 10 pesquisas (já funcionava,
  mantido sem alteração).

## Prioridade 4 — Interface

Revisado como parte das mudanças acima: áreas de toque de 44x44 mantidas
em todos os componentes novos (botão de microfone, cards de rota, cards de
histórico); alto contraste, modo escuro, fontes ampliadas e idiomas
continuam funcionando como antes (não foram alterados, pois já
funcionavam); Modo Simples corrigido (ver Prioridade 2).

**Pendência honesta:** uma auditoria completa de ordem de foco e navegação
por leitor de tela exige um leitor de tela real (VoiceOver/TalkBack) rodando
em um dispositivo físico, o que não é possível neste ambiente. O que foi
feito foi uma revisão estática do código (roles, labels, agrupamento de
elementos) - ver Prioridade 7 para o que precisa ser validado no aparelho.

## Prioridade 5 — Recuperação de senha

**Esta era a pendência mais séria encontrada:** o fluxo parava no envio do
e-mail. Corrigido com:
- Nova tela `ResetPasswordScreen`, que efetivamente chama
  `POST /auth/reset-password` com o token e a nova senha.
- Deep linking configurado em `RootNavigator` (`linking` do
  `NavigationContainer`) para `guiamobi://redefinir-senha?token=...`,
  abrindo `ResetPasswordScreen` já com o token preenchido.
- Um jeito de testar o fluxo **sem precisar de um cliente de e-mail
  integrado**: o link "Já tenho um código" em "Esqueci minha senha" abre a
  mesma tela manualmente, permitindo colar o token exibido no log do
  servidor (já que o SMTP real ainda não está configurado, como já era
  pendência documentada da Sprint 1).

## Prioridade 6 — Tutorial

Criada `TutorialScreen`, acessível a partir de Configurações
("Ver tutorial acessível"). Sete passos (Origem, Destino, Microfone,
Buscar rota, Favoritos, Histórico, Configurações de acessibilidade), cada
um com título marcado como cabeçalho para leitor de tela e um botão
"Ouvir explicação" que lê o passo em voz alta via `expo-speech`,
respeitando idioma e velocidade configurados.

## Prioridade 7 — Testes

**O que foi de fato executado neste ambiente:**
- `npx tsc --noEmit` na API: sem erros.
- `npx tsc --noEmit` no mobile: sem erros, após todas as mudanças.
- Auditoria automática de todas as chaves de tradução `t('...')` usadas no
  código contra os três arquivos de idioma (pt/en/es): nenhuma chave
  faltando (as únicas "faltas" apontadas pelo script eram as bases de
  pluralização, que o i18next resolve para `_one`/`_other` - confirmado
  manualmente que essas variantes existem).
- Revisão manual, arquivo por arquivo, de cada fluxo alterado.

**O que NÃO foi possível fazer neste ambiente, e precisa ser feito por
quem tiver um celular/emulador disponível** (esta lista é a mesma da
Prioridade 7 pedida na revisão):
- Login/cadastro/validações, recuperação de senha ponta a ponta (com SMTP
  real configurado), voz, microfone (ditado do teclado), origem, destino,
  rotas, favoritos, histórico, vibração, Modo Simples, alto contraste,
  modo escuro, tamanho do texto, idiomas, velocidade da voz.

Não marcamos nenhum desses itens como "concluído" só porque o código
compila ou porque a API responde 200 - eles exigem um dispositivo real
para validação, que este ambiente de desenvolvimento não possui.

## Resumo de pendências remanescentes

> Atualização: o envio SMTP (nodemailer) foi implementado e o acompanhamento
> da viagem passou a usar o GPS do aparelho; ver
> [`ATUALIZACAO_INTERFACE.md`](./ATUALIZACAO_INTERFACE.md). Falta apenas
> configurar credenciais SMTP reais.

1. SMTP real: implementado, falta configurar as credenciais no `.env`.
2. Acompanhamento de rota em tempo real (posição do veículo ao vivo,
   alerta de proximidade de parada) - depende de uma fonte de GPS da frota
   que não existe; documentado em `RouteDetailScreen` como aviso visível
   ao usuário, não fingido.
3. Reconhecimento de fala nativo (STT) dentro do próprio app - por
   restrição de tecnologia, usa o ditado do teclado do sistema (ver nota
   da Prioridade 1).
4. Testes reais em dispositivo (Prioridade 7) - checklist fornecido acima.
