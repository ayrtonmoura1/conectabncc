# 🌐 Conecta BNCC

> **Inteligência Artificial Semântica no Navegador, Grafos Curriculares e Mapeamento de Linhagem Pedagógica da BNCC** &bull; *100% Client-Side via WebAssembly e Transformers.js*

[![GitHub Pages](https://img.shields.io/badge/Deploy-GitHub%20Pages-22c55e?style=for-the-badge&logo=github)](https://pages.github.com/)
[![Transformers.js](https://img.shields.io/badge/Transformers.js-v2.17.2-6366f1?style=for-the-badge&logo=huggingface)](https://huggingface.co/docs/transformers.js)
[![D3.js](https://img.shields.io/badge/D3.js-v7-f97316?style=for-the-badge&logo=d3.js)](https://d3js.org/)
[![WebAssembly](https://img.shields.io/badge/WebAssembly-Wasm-6528e0?style=for-the-badge&logo=webassembly)](https://webassembly.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

---

## 📖 Visão Geral

O **Conecta BNCC** é uma plataforma educacional de alta performance desenvolvida para professores, coordenadores pedagógicos e pesquisadores explorarem as **1.517 habilidades curriculares da Base Nacional Comum Curricular (BNCC)**.

A plataforma permite pesquisar pela **intenção pedagógica, temas de aula ou ideias de atividades** em linguagem natural (ex: *"atividades de reciclagem e preservação da fauna"*, *"consciência fonológica na alfabetização"*, *"jogos de cooperação"*). 

A inteligência artificial roda **100% dentro do navegador do usuário**:
- 🔒 **Privacidade Total:** Nenhuma busca ou dado pedagógico trafega para a nuvem.
- 💸 **Custo Zero:** Funciona diretamente no GitHub Pages sem backend, banco de dados ou chamadas de API pagas.
- ⚡ **Alta Performance:** Inferência vetorial e cálculos de cosseno em menos de 25 milissegundos via WebAssembly.
- 💾 **Cache Inteligente:** O modelo neural é baixado apenas no primeiro acesso e armazenado no IndexedDB do navegador.

---

## ✨ Principais Funcionalidades

### 🔍 1. Busca Semântica Híbrida e Inteligente
- **Busca por Contexto e Conceito:** Encontra habilidades afins mesmo sem palavras coincidentes.
- **Busca Exata por Código:** Reconhece códigos curriculares (ex: `EF05MA08`, `EF01LP01`, `EI03EO02`) com 100% de prioridade e ativa a habilidade âncora.
- **Autocompletação Inteligente:** Sugestões em tempo real conforme você digita.

### 🌳 2. Três Modos de Visualização em Grafo Interativo (D3.js v7)
- **Organograma por Anos/Fases:** Estrutura em árvore de decisão com raias verticais (*swimlanes*) cronológicas da Educação Infantil ao Ensino Médio e curvas de afinidade.
- **Linhagem Pedagógica e Pré-Requisitos:** Linha do tempo em 3 colunas de precedência:
  - *⏮️ Prévia (Anos Anteriores):* O que o aluno precisa ter consolidado nos anos antecedentes.
  - *📌 Mesmo Ano (Apoio & Foco):* Habilidades contemporâneas que sustentam o mesmo objeto de conhecimento.
  - *⏭️ Futura (Continuidade):* Habilidades dos anos posteriores que desdobram a habilidade em foco.
- **Rede de Forças Semântica:** Simulação física com forças gravitacionais e repulsivas agrupando nós por afinidade temática.

### 🌐 3. Hub de Articulação Interdisciplinar (Mais Conexões)
- **Descoberta de Pontes Curriculares:** Algoritmo de centralidade que identifica quais habilidades de um determinado Ano/Fase dialogam com o maior número de disciplinas diferentes (ex: Ciências articulada com Matemática, Geografia e História).
- **Seletor Rápido de Anos (Pills):** Alterne entre 1º ao 9º Ano e Ensino Médio em 1 clique para ver os centros de convergência curricular de cada período.
- **Exibição de Habilidades Parceiras:** Cada card exibe as habilidades de outras disciplinas mais conectadas com percentual de afinidade, abrindo a gaveta de detalhes ou o grafo diretamente.

### 📋 4. Relação com Competências Gerais e Específicas
- Mapeamento detalhado das **10 Competências Gerais da Educação Básica (CG01 a CG10)**.
- Competências específicas vinculadas ao componente curricular (Língua Portuguesa, Matemática, Ciências da Natureza, História, Geografia, Arte, Educação Física e Língua Inglesa).

### 🎛️ 5. Experiência de Usuário e Produtividade
- **Filtros Curriculares Agrupados com Multiseleção:** Painel lateral fixo por padrão (e recolhível) com organização hierárquica por Etapa de Ensino (Educação Infantil, Fundamental Anos Iniciais, Fundamental Anos Finais e Ensino Médio), permitindo selecionar múltiplos anos simultaneamente, com master checkboxes (com estado indeterminado inteligente), botões de ação rápida `[Todos]` / `[Limpar]` e contadores dinâmicos por etapa.
- **Gaveta Lateral Não-Bloqueante:** Mantém o grafo 100% interativo, com controles de **Fixar (Pin)**, **Expandir**, **Minimizar em Pílula Flutuante** e **Fechar**.
- **Cópia Instantânea com 1 Clique:** Copia o código e a descrição limpa diretamente para a área de transferência.

---

## 🏛️ Arquitetura da Solução

```text
+-------------------------------------------------------------------------------+
| ETAPA OFFLINE DE PROCESSAMENTO (Python)                                       |
|                                                                               |
|  [ CSV Oficial BNCC ]  +  [ Mapas de Foco Reúna ]  +  [ Matrizes MEC ]       |
|            │                          │                         │             |
|            ▼                          ▼                         ▼             |
|    (gerar_base.py)       (extrair_progressao_foco.py)  (enriquecer_compet.py) |
|            │                          │                         │             |
|            ▼                          ▼                         ▼             |
|    bncc_vetores.json         progressao_bncc.json        competencias.json    |
| (384 dimensões L2 norm)   (Matriz de Pré-requisitos)   (CG01-10 + Específicas)|
+-------------------------------------------------------------------------------+
                                        │
                                        ▼ (Hospedagem estática GitHub Pages)
+-------------------------------------------------------------------------------+
| RUNTIME NO NAVEGADOR DO CLIENTE (index.html + Transformers.js + D3.js)         |
|                                                                               |
|  1. Consulta do usuário: "atividades de reciclagem e sustentabilidade"        |
|  2. Transformers.js gera o embedding (all-MiniLM-L6-v2 ONNX via WebAssembly)  |
|  3. Produto escalar vetorial contra 1.517 habilidades (< 25ms)                |
|  4. Matriz de compatibilidade calcula relações interdisciplinares e avanço    |
|  5. Visualização vetorial interativa em D3.js                                 |
+-------------------------------------------------------------------------------+
```

---

## 📐 Cálculo das Relações Pedagógicas

O Conecta BNCC não utiliza apenas a similaridade de texto bruta; ele combina a **proximidade vetorial densa** com uma **matriz de compatibilidade curricular**:

$$\text{CosSim}(\vec{q}, \vec{h}) = \sum_{i=1}^{384} q_i \cdot h_i$$

$$S_{\text{pedagógico}}(A, B) = \text{CosSim}(\vec{A}, \vec{B}) \times \text{Fator}_{\text{compat}}(A, B)$$

| Tipo de Relação | Condição Curricular | Fator |
| :--- | :--- | :--- |
| **Intradisciplinar (Mesmo Ano)** | Mesma disciplina e mesmo ano/fase | `1.25x` |
| **Progressão Direta** | Mesma disciplina e anos contíguos (ex: 4º &rarr; 5º ano) | `1.15x` |
| **Interdisciplinar** | Componentes curriculares distintos no mesmo ciclo | `1.05x` |
| **Transição de Ciclo** | Passagem de etapa (5º &rarr; 6º ano ou 9º &rarr; Ensino Médio) | `1.10x` |
| **Defasagem Extensa** | Diferença maior que 3 anos | `0.50x a 0.70x` |

Conexões abaixo do limiar configurável (padrão $\ge 35\%$) são filtradas para manter o grafo limpo.

---

## 📁 Estrutura do Repositório

| Arquivo / Diretório | Descrição |
| :--- | :--- |
| `index.html` | Aplicação web principal, cabeçalho compacto, busca, grafos e gaveta de detalhes. |
| `documentacao.html` | Página técnica completa explicando a metodologia, fórmulas, arquitetura e referências. |
| `style.css` | Design system com tipografia moderna, tokens CSS, componentes e animações. |
| `bncc_vetores.json` | Base vetorial com 1.517 habilidades, embeddings de 384 dimensões e palavras-chave. |
| `competencias_bncc.json` | Catálogo das 10 Competências Gerais e Competências Específicas por componente. |
| `bncc_progressao_pre_requisitos.json` | Matriz de conhecimentos prévios e habilidades de apoio (Mapas de Foco Reúna). |
| `models/` | Arquivos ONNX quantizados e tokenizadores locais do modelo `all-MiniLM-L6-v2`. |
| `gerar_base.py` | Script Python para pré-processamento com TF-IDF e geração dos embeddings L2. |
| `enriquecer_competencias.py` | Script Python para associar habilidades às Competências Gerais e Específicas. |
| `extrair_progressao_foco.py` | Script Python para extrair as cadeias de progressão dos Mapas de Foco. |
| `baixar_modelo.py` | Script utilitário para download dos pesos locais do modelo na pasta `models/`. |
| `recursos_adicionais/` | *(Local/Ignorado no Git)* Pasta com planilhas brutas, PDFs de consulta e rascunhos. |
| `.gitignore` | Configuração de arquivos ignorados no controle de versão Git. |
| `README.md` | Apresentação e documentação do repositório. |

---

## 🚀 Como Executar Localmente

Como a aplicação carrega arquivos JSON e modelos WebAssembly locais via `fetch()`, os navegadores exigem que ela seja servida via protocolo HTTP local (não através de `file:///` direto por restrições de CORS).

### Opção 1: Servidor HTTP do Python (Mais simples)
No terminal, dentro da pasta do projeto:
```bash
python -m http.server 8000
```
Em seguida, abra no navegador: **[http://localhost:8000](http://localhost:8000)**

### Opção 2: Extensão Live Server (VS Code)
1. Abra a pasta do projeto no VS Code.
2. Clique com o botão direito sobre o arquivo `index.html`.
3. Selecione **"Open with Live Server"**.

---

## 🌐 Publicação no GitHub Pages (Passo a Passo)

O projeto é 100% compatível com o GitHub Pages:

1. **Inicialize o repositório Git local:**
   ```bash
   git init
   git add .
   git commit -m "feat: lancamento do Conecta BNCC com busca semantica e grafos"
   git branch -M main
   ```

2. **Vincule ao seu repositório remoto no GitHub:**
   ```bash
   git remote add origin https://github.com/SEU_USUARIO/conecta-bncc.git
   git push -u origin main
   ```

3. **Ative o GitHub Pages:**
   - No GitHub, acesse a aba **Settings** do seu repositório.
   - No menu lateral esquerdo, clique em **Pages**.
   - Em **Source**, selecione **Deploy from a branch**.
   - Em **Branch**, selecione `main` e a pasta `/(root)`.
   - Clique em **Save**.

Em poucos instantes seu projeto estará online em:
`https://SEU_USUARIO.github.io/conecta-bncc/`

---

## 🏛️ Créditos Institucionais, Fontes Oficiais & Parceria Pedagógica

O **Conecta BNCC** foi desenvolvido com base nos documentos normativos oficiais do Ministério da Educação e integra metodologias, análises e progressões de aprendizagem coordenadas pelo **Instituto Reúna** sob prévia aprovação e autorização de uso e adaptação para fins educacionais abertos.

### 📚 Obras e Referenciais Adaptados:

1. **Mapas de Foco da BNCC (Ensino Fundamental — 1º ao 9º Ano)**
   - *Autoria/Coordenação:* Instituto Reúna, Fundação Lemann e Itaú Social.
   - *Contribuição no Projeto:* Matriz de priorização curricular oficial, diferenciando **Aprendizagens Focais (AF)**, **Aprendizagens Complementares (AC)** e **Habilidades de Apoio (HA)**, além de mapeamento longitudinal de pré-requisitos essenciais e expectativas de fluência.
   - *Link:* [institutoreuna.org.br/iniciativa/mapas-de-foco-bncc/](https://institutoreuna.org.br/iniciativa/mapas-de-foco-bncc/)

2. **BNCC Comentada para o Ensino Médio**
   - *Autoria/Coordenação:* Instituto Reúna.
   - *Contribuição no Projeto:* Análise analítica profunda das habilidades por grandes áreas do conhecimento, contribuição específica de cada componente curricular (Física, Química, Biologia, História, Geografia, Filosofia, Sociologia etc.), objetos de conhecimento e possibilidades pedagógicas de integração curricular.
   - *Link:* [institutoreuna.org.br/iniciativa/bncc-comentada-ensino-medio/](https://institutoreuna.org.br/iniciativa/bncc-comentada-ensino-medio/)

3. **Dimensões e Desenvolvimento das Competências Gerais da BNCC**
   - *Autoria/Coordenação:* Instituto Reúna, Instituto Ayrton Senna e Fundação Lemann.
   - *Contribuição no Projeto:* Desdobramento operacional das 10 Competências Gerais da Educação Básica em dimensões, subdimensões e marcos de progressão ao longo de 4 ciclos formativos (*Até o 3º ano EF*, *Até o 6º ano EF*, *Até o 9º ano EF* e *Até o Ensino Médio*), integrados ao modal interativo de competências.
   - *Link:* [institutoreuna.org.br/iniciativa/dimensoes-das-competencias-gerais-da-bncc/](https://institutoreuna.org.br/iniciativa/dimensoes-das-competencias-gerais-da-bncc/)

4. **Base Nacional Comum Curricular (BNCC Oficial)**
   - *Autoria:* Ministério da Educação (MEC) / Conselho Nacional de Educação (CNE).
   - *Link:* [basenacionalcomum.mec.gov.br](http://basenacionalcomum.mec.gov.br/)

5. **Engenharia de IA & Bibliotecas Open-Source:**
   - **Hugging Face / Xenova:** [Transformers.js](https://huggingface.co/docs/transformers.js) (v2.17.2)
   - **Sentence-Transformers:** Modelo [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) quantizado em ONNX
   - **D3.js:** [D3.js v7](https://d3js.org/) (Data-Driven Documents para grafos e física de partículas)

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte `LICENSE` para mais informações. Os direitos autorais dos referenciais pedagógicos originais e das metodologias curriculares citadas pertencem ao **Instituto Reúna** e aos seus respectivos parceiros institucionais.

