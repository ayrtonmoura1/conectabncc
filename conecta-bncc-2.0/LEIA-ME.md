# Conecta BNCC 2.0

Catálogo local para explorar as aprendizagens da BNCC e suas conexões.

## Abrir

No Windows, execute `INICIAR.bat`. Ele inicia um servidor apenas no próprio computador e abre o navegador no endereço local exibido na janela. O aplicativo usa a porta 8766 quando ela está livre e escolhe outra porta disponível se necessário. Não há chamadas a APIs remotas. Os arquivos de dados ficam na pasta `dados/`; por isso o catálogo segue disponível sem conexão com a internet.

Se preferir iniciar manualmente, abra um terminal nesta pasta e execute:

```powershell
python iniciar.py
```

O navegador será aberto no endereço local escolhido pelo aplicativo.

## O catálogo

As faixas nascem recolhidas: cada uma mostra o título, a contagem e um resumo do que reúne. Clique no título ou no resumo para abri-la; ao abrir, aparecem os chips, os cartões e os demais controles de sempre. Durante uma busca ou um filtro, as faixas com resultados abrem sozinhas.

As faixas do catálogo reúnem Educação Infantil, Anos Iniciais, Anos Finais, Ensino Médio, BNCC Computação e referências Reúna. Computação inclui as aprendizagens do complemento à BNCC e os registros do currículo CIEB aparecem como referências relacionadas. Os atalhos coloridos abaixo do título de cada faixa filtram apenas aquela faixa por componente, área, campo de experiência ou eixo; use “Todos” para restaurá-la. O menu superior permite filtrar o catálogo inteiro, e a busca funciona por código, texto, componente e tema.

Passe o cursor sobre um cartão para destacá-lo suavemente. As barras horizontais ficam ocultas; os cartões parcialmente visíveis indicam que há mais conteúdo. As faixas com mais de uma habilidade continuam em ciclo nas duas direções: use as setas ou deslize no celular. Com um cartão em foco, use as setas esquerda e direita do teclado para navegar e Enter ou Espaço para abrir a habilidade. Os chips continuam filtrando a faixa. A página da habilidade reúne o grafo de progressão, a referência de origem, relações estruturais e temáticas, as sugestões interdisciplinares de IA existentes no projeto, referências do CIEB e Reúna, e as visualizações de conexões já disponíveis. O botão de retorno leva ao catálogo. A opção de tema claro/escuro fica no cabeçalho e guarda a escolha no navegador.

Na página de uma habilidade, cada seção (Organização, Competências, Relações de progressão, Mapa de progressão, Computação, Interdisciplinar, CIEB e Reúna) mostra título e descrição e começa recolhida; clique no título, na descrição ou na própria seção para abrir o conteúdo. Um link do menu ou da página abre a seção de destino automaticamente. O mapa de progressão é montado na primeira vez que a sua seção é aberta. Na impressão, as seções escolhidas são exibidas por completo.

## Grafo de progressão

O índice `bncc-busca.min.json` é lido ao iniciar. `bncc-grafo.json` só é carregado ao abrir uma habilidade BNCC; os índices ficam em memória e, quando permitido pelo navegador, o arquivo é guardado no Cache API. Os dois arquivos do ZIP foram copiados sem alterações. O mapa usa Cytoscape.js 3.29.2, dagre 0.8.5 e cytoscape-dagre 2.5.0, distribuídos localmente em `vendor/` com suas licenças; não é necessário instalar pacotes ou acessar a internet para usar a aplicação.

Na página de uma habilidade, o mapa aparece abaixo das informações, com colunas por ano ou fase, e pode ser ampliado pelo botão “Expandir mapa”. Ajuste as profundidades, as forças das relações e os contextos; clique num nó para navegar e use o histórico do navegador para voltar. A opção de trilha mostra todos os membros das trilhas associadas. Relações inferidas são sempre identificadas como sugeridas. Relações fracas começam desativadas: por exemplo, ative “Fraca” para ver no mapa as pontes de `EI03ET07` para `EF01MA01` e `EF01MA03`. O grafo fornecido cobre BNCC e Computação; os registros CIEB continuam disponíveis nas seções existentes, sem atribuir a eles progressões que não constem no arquivo.

O servidor `iniciar.py` entrega os dois JSONs do grafo com gzip quando o navegador o aceita. No Live Server, a compressão depende da extensão e de sua configuração; os arquivos continuam funcionando sem compressão.

Para testar os dados e a navegação, execute `node tests/grafo.test.js` a partir da pasta da V2 e abra, por exemplo, `?codigo=EF06MA01` no navegador. Confira os filtros, a opção de estrutura, a trilha completa e a navegação entre nós. O Node é necessário apenas para esse teste, não para usar a aplicação.

Para deixar a navegação mais leve, cada faixa carrega mais cartões conforme você avança. Nos detalhes, abra “Ver mais habilidades relacionadas” e use “Carregar mais” para percorrer as demais conexões. Os filtros e a busca continuam considerando a base inteira.

As relações são calculadas localmente. Vínculos por objeto, competência ou alinhamento indicam referências compartilhadas na estrutura dos dados. A base do CIEB contém indicações próprias de habilidades BNCC, apresentadas com essa origem. Continuidade temática e outras aproximações por palavras em comum são sugestões para exploração pedagógica; não são pré-requisitos oficiais. As sugestões interdisciplinares existentes foram preservadas com seus textos, atividades e origem de IA.

## Dados e atribuição

- **BNCC 2018 e complemento de Computação 2022:** [bncc.dev (mantido pela Profy)](https://github.com/bncc-dev/bncc-dados), CC BY 4.0. Grafo e índice recebidos: `dados-2026.08`; fontes complementares existentes: `dados-2026.07.1`.
- **Currículo de Referência em Tecnologia e Computação:** CIEB, [curriculo.cieb.net.br](https://curriculo.cieb.net.br/).
- **Sugestões interdisciplinares:** base local do Conecta BNCC, produzida com IA. As sugestões precisam de revisão pedagógica.
- **Referências Reúna:** hierarquia e referências locais preservadas do projeto Conecta BNCC.
- **Mapas de Foco da BNCC (Instituto Reúna):** classificação (AF, AC e EF), objetivos, competências, relações e comentários pedagógicos das habilidades de Língua Portuguesa, Matemática, Ciências da Natureza e Ciências Humanas, nos anos iniciais e finais. Os dados ficam no campo `mapaDeFoco` de `dados/hierarquia_reuna.json`, gerados a partir de `dados/MapasDeFocoBncc_Unificados.xlsx`. A visão geral, as progressões (matrizes por campo, unidade ou eixo e cadeias de propostas P), os resumos por ano e as orientações de leitura ficam em `dados/reuna_visao_geral.json`; cada habilidade aponta para as suas trilhas pelo campo `progressao` de `hierarquia_reuna.json`. Fonte: © 2020 Instituto Reúna, Mapas de Foco da BNCC, todos os direitos reservados.
- **BNCC Comentada para o Ensino Médio (Instituto Reúna):** comentários, objetos do conhecimento, comentários dos componentes, exemplos de objetivos e possibilidades curriculares por competência específica e por habilidade do Ensino Médio, a partir de `dados/ciencias-da-natureza-e-suas-tecnologias.xlsx`, `dados/matematica-e-suas-tecnologias.xlsx`, `dados/ciencias-humanas-e-sociais-aplicadas.xlsx` e `dados/linguagens-e-suas-tecnologias.xlsx`. Os comentários ficam no campo `bnccComentada` de `dados/hierarquia_reuna.json`, e as competências em `competenciasEspecificasEM` de `dados/reuna_visao_geral.json`. Fonte: © 2020 Instituto Reúna, BNCC Comentada para o Ensino Médio, todos os direitos reservados.

Os arquivos BNCC fornecem 1.721 aprendizagens: 93 objetivos da Educação Infantil, 1.304 habilidades do Ensino Fundamental, 183 do Ensino Médio e 141 do complemento de Computação. A interface também inclui 147 referências do CIEB.

## Arquivos principais

- `index.html`, folhas CSS e `app.js`: interface e navegação.
- `bnccData.js`, `bnccGraph.js`, `SkillPanel.js`, `SkillGraph.js` e `grafo.css`: carregamento, índices, vizinhança e interface do grafo.
- `vendor/`: bibliotecas do mapa e licenças, mantidas localmente.
- `iniciar.py`: servidor local, seleção de porta disponível e abertura do navegador.
- `dados/`: cópias locais das fontes curriculares e dos dados do projeto mantidos para a versão 2.0.

Para atualizar a BNCC, fixe uma nova versão do `bncc-dados`, confira o changelog e atualize juntos os arquivos de EI, EF, EM, estrutura e Computação. Registre a versão atualizada neste documento e confira as relações geradas para códigos novos ou alterados.
