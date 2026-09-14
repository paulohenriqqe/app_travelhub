# TravelHub

Viagens planejadas, concluídas e canceladas compartilham um cadastro. O aplicativo lê e grava a aba `Viagens` pelo Apps Script. Home, mapas e gráficos usam apenas viagens concluídas.

Se a integração estiver indisponível, o aplicativo pode consultar a mesma aba `Viagens` pelo CSV já publicado da planilha. Esse modo aparece como **Somente consulta** e bloqueia gravações, sem simular sucesso ou usar as abas antigas. Atualizar os dados reativa a gravação quando o serviço estiver disponível.

Se a resposta de gravação se perder, a confirmação alternativa exige que a planilha contenha o identificador exato da solicitação, a versão esperada e todos os dados enviados. Uma leitura antiga, outro pedido ou uma edição concorrente não confirmam sucesso. Enquanto esse recibo não estiver disponível, o formulário preserva os dados e permite repetir o mesmo pedido.

## Validação

```sh
node --test tests/*.test.cjs
node tools/build-apps-script.cjs ../TravelHub-v2.gs
```

Para verificar a migração com uma cópia local das duas bases, mantenha os dados pessoais fora do repositório:

```sh
node tools/validate-migration.cjs ../legacy-fixture.json ../migrated-fixture.json
node tools/dev-server.cjs ../migrated-fixture.json
```

O servidor de teste abre em `http://localhost:8765`. Ele substitui a integração somente na resposta local, sem alterar a configuração publicada. Os dados de teste ficam em memória.

## Publicação da base única

1. Salvar uma cópia do código original do Apps Script e da planilha.
2. Colar o arquivo produzido por `build-apps-script.cjs` no projeto vinculado à planilha.
3. Executar `validarMigracao`: cria uma cópia da planilha, migra e repete a operação para verificar idempotência. O resultado esperado é 33 viagens e 37 paradas. O endereço da cópia aparece no registro de execução.
4. Executar `publicarMigracao` somente após a validação. A função verifica que a origem não mudou, cria um backup integral e ativa `Viagens`. As abas antigas permanecem recuperáveis no backup e no histórico da planilha.
5. Atualizar a implantação existente do Apps Script para uma nova versão, preservando endereço e permissões. Conferir a resposta de `?action=list_journeys` com `schemaVersion: 2`.
6. Publicar a versão do aplicativo no GitHub Pages, mantendo `GOOGLE_SCRIPT_URL` apontado para a implantação existente.

As propriedades `MIGRATION_TEST_URL` e `MIGRATION_BACKUP_URL` do projeto registram os endereços das cópias. O arquivo `Origem` de cada viagem guarda todas as linhas históricas correspondentes. A migração interrompe a execução se os totais da origem mudarem e não deve ser reaplicada sobre uma base diferente sem revisão.

## Reversão

Restaurar as duas abas da cópia integral, voltar a implantação anterior do Apps Script e reverter a alteração do aplicativo. Não restaurar apenas o aplicativo enquanto a base única estiver ativa. Preservar e reconciliar qualquer viagem criada após a migração antes de reverter dados.

## Contrato

- `GET ?action=list_journeys`: retorna `ok`, `schemaVersion: 2` e `journeys`.
- `POST save_journey`: recebe `schemaVersion: 2`, `requestId` e `payload: { journey, expectedVersion }`. Retorna o cadastro persistido e sua versão.
- IDs de viagens e paradas são independentes e permanentes. A gravação usa bloqueio e controle de versão; repetir o mesmo pedido devolve o cadastro já salvo.
- Concluir mantém o planejamento original. Reabrir ou cancelar preserva o histórico. Datas passadas nunca concluem uma viagem automaticamente.
- A duração do MSC Seaside considera somente as datas das paradas registradas. Dias sem evidência não são preenchidos.
- Use o editor do aplicativo para alterar viagens e paradas. As colunas estruturadas da planilha ficam ocultas para reduzir alterações acidentais.

Não publicar cópias de planilhas, respostas da integração ou arquivos com dados pessoais no repositório.
