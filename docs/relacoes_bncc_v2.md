# Geração experimental — Relações 2 da BNCC

O fluxo revisado produz `relacoes_bncc_v2_progressao.json` a partir dos 1.517 códigos presentes em `bncc_vetores.json` (EI, EF e EM). A Maritaca sugere fios e relações; textos e metadados dos registros são montados localmente. A saída é experimental e não substitui automaticamente `relacoes_bncc_v2.json`, `relacoes_bncc_final.json` nem o mapa atual.

## Fontes e fidelidade

- `bncc_vetores.json` é a fonte dos códigos, textos, etapas inferidas pelo padrão do código, componentes e campos curriculares preenchidos.
- `relacoes_bncc_final.json` é consultado somente para `objetos_conhecimento`. O complemento só é aceito para um código se `descricao` coincidir literalmente com `habilidade` na matriz. Arestas e sugestões desse arquivo **não** são importadas.
- Textos oficiais são copiados da matriz, retirando somente o rótulo inicial do próprio código entre parênteses, se houver. Dados que não constam da fonte permanecem `null` e são anotados em `verificacao`.
- Para EI, o campo de experiência é emitido em `unidadeTematica`; `objetoConhecimento` permanece `null`.
- O inventário identificado contém 93 itens EI, 1.241 EF e 183 EM. Quando a matriz não fornece unidade temática ou objeto para um item EM, o gerador não os inventa.

## Chave e limites

O gerador procura `MARITACA_API_KEY` primeiro no ambiente do processo e depois no `.env` da raiz. A chave nunca é impressa, escrita nos checkpoints ou enviada ao navegador. Não cole a chave no terminal de diagnóstico, em arquivos versionados ou no chat.

As próximas chamadas priorizam `S5-free`; quando houver HTTP 429 ou limite local do modelo gratuito, a execução passa ao `sabiazinho-4` até terminar ou ser reiniciada. Erros comuns de JSON e rede não acionam o modelo pago. O modelo de cada lote fica no checkpoint; o JSON final lista os modelos usados. Pela tabela oficial de [Preços](https://docs.maritaca.ai/pt/precos), consultada em **5 nov. 2026**, `Sabiazinho 4` custa **R$ 1 por milhão de tokens de entrada** e **R$ 4 por milhão de tokens de saída**. O dry-run calcula uma projeção conservadora como se todos os lotes restantes usassem o modelo pago. O gerador pausa ao atingir o teto cumulativo local de **R$ 20**; isso não monitora gastos externos feitos pela mesma chave.

A documentação oficial de [Rate Limits](https://docs.maritaca.ai/pt/rate-limits) informa para `S5-free` 60 RPM e 256k TPM de entrada e saída; para evitar dependência dos limites específicos da conta, o script mantém guardas locais para as chamadas pagas: 12 RPM, envelope combinado estimado de 64.000 tokens por minuto, até 500 chamadas e 5.000.000 tokens por dia UTC, além do teto cumulativo de R$ 20. As cotas diárias são proteções locais, não limites oficiais da Maritaca. O ledger pago contabiliza somente este script nesta máquina; outros usos da mesma chave não são visíveis. Respostas `429` respeitam `Retry-After` quando recebido e têm tentativas limitadas.

As reservas gratuitas antigas permanecem em `relacoes_bncc_v2/_usage.json`. As chamadas pagas de Sabiazinho usam `relacoes_bncc_v2/_usage_sabiazinho4.json`, com limite diário próprio de 5.000.000 tokens e teto cumulativo de R$ 20; ambas as trilhas guardam seus registros localmente, sem a chave. O checkpoint anterior permanece em `relacoes_bncc_v2_fios/`; a nova geração usa `relacoes_bncc_v2_fios_progressao/` e não o sobrescreve.

## Revisão de progressão e articulações

O gerador agora reserva candidatas para habilidades anteriores do mesmo componente, do mesmo ano/fase em outros componentes e de anos/fases anteriores em outros componentes. A semelhança vetorial apenas seleciona candidatas: a IA decide a relação, o tipo, a direção, a confiança e uma justificativa. As relações são consultadas nos dois sentidos; assim, uma conexão selecionada para um alvo posterior também aparece como posterior para a habilidade de origem.

Intervalos de anos sobrepostos são tratados como mesmo recorte; para a Educação Infantil, comparam-se as faixas EI01, EI02 e EI03. Na interface, as relações ficam organizadas como anteriores, mesmo ano/fase, posteriores e paralelas, com interdisciplinares identificadas por componente. A seção existente de sugestões interdisciplinares de IA permanece separada.

A seleção padrão considera até seis candidatas por alvo e prioriza diversidade para caber no limite de custo; aumente `--max-candidates` para uma busca mais ampla, observando que isso pode elevar bastante o custo e o número de lotes. O limite local de R$ 20 é cumulativo com o histórico do ledger, não um orçamento adicional. A ausência de uma relação na base não prova que ela não exista.

## Execução

1. Faça o diagnóstico sem API ou gravação:

   ```powershell
   python scripts/gerar_relacoes_bncc_v2_maritaca.py --dry-run
   ```

2. Se estiver iniciando uma execução nova, faça um piloto de um lote (o fallback para `sabiazinho-4` é cobrado):

   ```powershell
   python scripts/gerar_relacoes_bncc_v2_maritaca.py --limit-batches 1
   ```

   Revise o resultado e a amostra de fios/arestas antes de ampliar a execução. O piloto consome uma chamada (além de possíveis retries) e cria checkpoint e saída marcada como parcial.

3. Para continuar após revisar o piloto, use os mesmos parâmetros de lote. O checkpoint da versão de fios revisada é retomado automaticamente e o limite diário impede exceder o orçamento local:

   ```powershell
   python scripts/gerar_relacoes_bncc_v2_maritaca.py --retry-errors
   ```

   O processo pode parar ao atingir a cota diária local. Rode novamente após a virada UTC. `--limit-batches N` limita lotes pendentes naquela execução; não apaga o estado. Lotes que já falharam ficam em espera por padrão; depois de examinar o motivo salvo no checkpoint, use `--retry-errors` para tentar novamente. Para erros de resposta incompleta em lotes maiores, `--retry-errors --split-failed-batches` faz chamadas unitárias, salva cada alvo assim que conclui e só fecha o lote original quando todos os alvos estiverem classificados; pode ser retomado sem repetir alvos já persistidos.

4. Valide uma saída parcial durante o piloto:

   ```powershell
   python scripts/validar_relacoes_bncc_v2.py --input relacoes_bncc_v2_progressao.json --allow-partial
   ```

5. Só depois de todos os alvos serem classificados, rode a validação final sem `--allow-partial`:

   ```powershell
   python scripts/validar_relacoes_bncc_v2.py --input relacoes_bncc_v2_progressao.json --report relacoes_bncc_v2/validacao_progressao.json
   ```

Não altere `--batch-size`, `--max-candidates` ou `--max-prompt-chars` no meio da geração. O limite de saída pode ser aumentado com segurança; o checkpoint registra o aumento e preserva os lotes já concluídos. Para outros parâmetros que alterem os lotes, use outro `--state-dir` para preservar o checkpoint antigo. O prompt da versão de fios revisada compara os alvos do lote, favorece nomes compartilhados para trajetórias coerentes e só oferece no catálogo fios já usados por ao menos dois itens.

Depois da geração completa, validação e revisão pedagógica, publique explicitamente a nova saída como `relacoes_bncc_v2.json` para que a interface a carregue. Não substitua a base ativa por uma saída parcial. As visões históricas `horizontais`/`verticais` no JSON mantêm o esquema do gerador para compatibilidade; o painel usa as arestas e calcula o período pelos metadados curriculares.

## O que é validado

- Um registro por código esperado, correspondência literal dos textos oficiais e contagens por recorte.
- Referências existentes, tipos permitidos, duplicatas, pares invertidos, escopo e orientação temporal.
- Grafo acíclico, IDs canônicos e correspondência exata entre arestas e visões horizontais, verticais e paralelas nos dois endpoints.
- Coerência entre dicionário de fios, `progressaoPorFio` e ordem por fio.
- Checklist com pendências, percentual de inferências, ciclos e arestas sem referência.

Uma estrutura validada não equivale a uma revisão pedagógica humana. A saída precisa ser examinada antes de alimentar qualquer visualização ou substituir dados existentes.

## Testes locais

```powershell
python -m unittest discover -s tests -p "test_*.py"
python scripts/gerar_relacoes_bncc_v2_maritaca.py --dry-run
```
