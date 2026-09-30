# US01 + US04 — correções do Dia 2

## US01 — isolamento de dados locais por conta

### Problema confirmado
O SQLite (`guiamobi.db`) é compartilhado pelo aplicativo no aparelho. As tabelas locais de favoritos, histórico e linhas favoritas não tinham associação com a conta autenticada. Por isso, uma conta nova podia visualizar dados gravados por outra conta no mesmo dispositivo.

### Correção
- Migração SQLite para a versão 3.
- `favorites` e `search_history` agora possuem `user_id`.
- Consultas, inserções, alterações e exclusões são filtradas pelo `user_id` da sessão armazenada no SecureStore.
- `favorite_lines` foi recriada com chave composta `(user_id, line_id)`, permitindo que contas diferentes favoritem a mesma linha sem compartilhar o registro.
- Registros antigos das versões anteriores ficam sem proprietário (`user_id = NULL`) e não são exibidos para nenhuma conta, porque não é possível atribuí-los com segurança.
- React Query agora inclui o ID do usuário nas chaves de cache, evitando reaproveitamento visual do cache ao trocar de conta.

### Teste recomendado
1. Conta A: criar favorito e fazer 2 buscas.
2. Sair.
3. Conta B: verificar Favoritos e Histórico vazios.
4. Criar um favorito e uma busca na conta B.
5. Voltar para A e confirmar que aparecem somente os dados de A.
6. Fechar e reabrir o aplicativo e repetir a verificação.

## US04 — voz da FAQ / Ajuda

### Problema confirmado
O botão `Ouvir resposta` da FAQ chamava a função central de fala, mas essa função não verificava o estado de voz desativada. Assim, era possível ouvir uma resposta mesmo com a voz desativada em Configurações.

### Correção
- `useAccessibility().speak()` agora verifica a preferência central de feedback antes de iniciar TTS.
- Quando a voz está desativada, a fala é interrompida e nenhuma nova fala é iniciada.
- A FAQ continua usando o serviço central existente; não foi criada uma segunda implementação de TTS.
- Não houve alteração visual ou inclusão de botão flutuante.

### Teste recomendado
1. Configurações → desativar voz.
2. Ajuda → abrir qualquer FAQ.
3. Tocar em `Ouvir resposta`.
4. Confirmar que não há áudio.
5. Reativar voz e repetir; confirmar que o áudio volta.
6. Alterar idioma e velocidade e verificar que a FAQ continua usando as preferências centrais.

## Recuperação de senha — situação atual

O fluxo de backend já possui:
- token aleatório criptograficamente seguro;
- armazenamento somente do hash do token;
- validade de 30 minutos;
- uso único do token, com proteção contra concorrência;
- senha armazenada com Argon2id;
- resposta genérica para não revelar se o e-mail possui cadastro.

A entrega do e-mail depende de SMTP real configurado no ambiente da API. O `.env.example` atualmente deixa `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS` vazios. Sem essas variáveis, o código não envia um e-mail real em desenvolvimento; portanto, essa parte não pode ser validada como entrega de e-mail sem configurar um provedor SMTP real.

Não foi criado e-mail, SMTP ou token fictício para mascarar essa dependência.

## Validação desta edição

- Revisão estática das consultas SQL e dos pontos de chamada: realizada.
- Verificação de que a FAQ não chama `Speech.speak` diretamente: realizada.
- Verificação de que o TTS da FAQ passa pelo `useAccessibility().speak()`: realizada.
- TypeScript: não foi possível executar a compilação completa porque o ZIP não contém `node_modules`; uma tentativa de instalação das dependências excedeu o tempo disponível do ambiente.
- Testes funcionais no dispositivo devem ser feitos com foco nos dois fluxos acima antes de considerar a correção encerrada.
