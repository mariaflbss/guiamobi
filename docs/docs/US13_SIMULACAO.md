# US13 — Simulação controlada para demonstração

A simulação do mobile mantém o alerta real de destino e acrescenta uma condição controlada para a parada de alta movimentação.

## Como testar

1. Abra uma rota que tenha pelo menos uma parada intermediária entre o embarque e o destino.
2. Inicie a viagem. A simulação continua automática, sem botão extra.
3. A primeira parada intermediária do trecho é marcada apenas na simulação como parada de alta movimentação.
4. Ao chegar a aproximadamente 200 m dessa parada, aparece o alerta **Parada de alta movimentação**, com fala (quando habilitada) e o padrão de vibração específico de alta movimentação.
5. Continue a simulação até o destino. A aproximadamente 200 m do destino continua aparecendo a tela **Prepare-se!**, com o padrão curto de vibração já validado.

## Diferenciação da vibração

- Alta movimentação: sequência com dois pulsos, sendo um curto e um longo (`[0, 100, 180, 500]`).
- Destino próximo: pulso curto (`100 ms`).

Assim, os dois eventos usam padrões distintos.

## Importante

A demonstração está controlada pela constante `DEMO_HIGH_MOVEMENT_IN_SIMULATION` em `mobile/src/screens/TrackingScreen.tsx`.

Ela está `true` para permitir a demonstração da Sprint 2 sem depender de outro usuário ativo no backend.

Para voltar ao comportamento exclusivamente baseado no endpoint de movimentação, altere essa constante para `false`.
