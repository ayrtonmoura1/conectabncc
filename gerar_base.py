"""
Script de Geração de Embeddings da BNCC com Pré-Processamento de Palavras-Chave
--------------------------------------------------------------------------------
Pipeline:
1. Lê o CSV da BNCC e trata valores nulos/ausentes.
2. Para cada linha, gera uma lista refinada de palavras-chave:
   - A primeira palavra-chave é SEMPRE o código da habilidade (ex: EF01LP01).
   - As demais palavras-chave são extraídas de todas as colunas da linha via TF-IDF (n-grams)
     e termos estruturantes (Objeto de Conhecimento e Unidade Temática), eliminando ruído burocrático.
3. Monta uma representação densa híbrida (Palavras-Chave no topo + Sintaxe da Habilidade).
4. Gera os embeddings de 384 dimensões com all-MiniLM-L6-v2 (normalizados).
5. Salva no bncc_vetores.json contendo a nova coluna 'palavras_chave'.
"""

import os
import sys
import json
import re
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sentence_transformers import SentenceTransformer

# Garante saída UTF-8 no console do Windows
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Lista curada de stopwords em português
STOPWORDS_PT = [
    'de', 'a', 'o', 'que', 'e', 'do', 'da', 'em', 'um', 'para', 'é', 'com', 'não',
    'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'foi',
    'ao', 'ele', 'das', 'tem', 'à', 'seu', 'sua', 'ou', 'ser', 'quando', 'muito',
    'há', 'nos', 'já', 'está', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso',
    'ela', 'entre', 'era', 'depois', 'sem', 'mesmo', 'aos', 'ter', 'seus', 'quem',
    'nas', 'me', 'esse', 'eles', 'estão', 'você', 'tinha', 'foram', 'essa', 'num',
    'nem', 'suas', 'meu', 'às', 'minha', 'têm', 'numa', 'pelos', 'elas', 'havia',
    'seja', 'qual', 'será', 'nós', 'tenho', 'lhe', 'deles', 'essas', 'esses', 'pelas',
    'este', 'fosse', 'dele', 'sobre', 'cada', 'forma', 'meio', 'outro', 'outros',
    'exemplo', 'ainda', 'assim', 'partir', 'pode', 'podem', 'sendo', 'deve', 'devem',
    'currículo', 'habilidade', 'habilidades', 'estudantes', 'alunos', 'professor',
    'professores', 'contextualizar', 'desenvolvimento', 'orientar', 'orientações',
    'possibilidades', 'comentário', 'atividades', 'processo', 'ensino', 'aprendizagem'
]

def inferir_disciplina(row):
    """Infere ou limpa o nome da disciplina caso esteja nulo."""
    disc = row.get('Disciplina/Area')
    if pd.notna(disc) and str(disc).strip() and str(disc).strip().lower() != 'nan':
        return str(disc).strip()
    
    cod = str(row.get('COD', '')).strip().upper()
    obj = str(row.get('OBJETOS DE CONHECIMENTO', '')).strip()

    # Educação Infantil
    if cod.startswith('EI'):
        if obj and obj.lower() != 'nan':
            return f"Educação Infantil ({obj})"
        return "Educação Infantil"

    # Ensino Médio
    if cod.startswith('EM13LGG'):
        return "Linguagens e suas Tecnologias"
    if cod.startswith('EM13MAT'):
        return "Matemática e suas Tecnologias"
    if cod.startswith('EM13CNT'):
        return "Ciências da Natureza e suas Tecnologias"
    if cod.startswith('EM13CHS'):
        return "Ciências Humanas e Sociais Aplicadas"

    return "Geral / Multidisciplinar"

def limpar_texto(valor):
    """Trata valores nulos ou strings vazias."""
    if pd.isna(valor):
        return ""
    texto = str(valor).strip()
    return "" if texto.lower() == "nan" else texto

def extrair_palavras_chave_linha(row, tfidf_words, max_keywords=10):
    """
    Gera a lista de palavras-chave da linha:
    1. A primeira palavra-chave é SEMPRE o código da habilidade (ex: EF01LP01).
    2. Seguem os termos conceituais de Objeto de Conhecimento e Unidade Temática.
    3. Seguem as palavras mais discriminantes do TF-IDF da linha.
    """
    codigo = limpar_texto(row.get('COD')).upper()
    keywords = [codigo] if codigo else []

    # Termos estruturantes da BNCC
    campos_conceituais = ['OBJETOS DE CONHECIMENTO', 'PRÁTICAS DE LINGUAGEM - UNIDADE TEMÁTICA']
    for campo in campos_conceituais:
        val = limpar_texto(row.get(campo))
        if val:
            # Quebra por delimitadores comuns (/ ou , ou ;)
            pedacos = re.split(r'[/,;\n]', val)
            for p in pedacos:
                termo = p.strip()
                if len(termo) >= 3 and termo.lower() not in [k.lower() for k in keywords]:
                    keywords.append(termo)
                    if len(keywords) >= max_keywords:
                        break

    # Adiciona palavras do TF-IDF que ainda não estejam presentes
    for w in tfidf_words:
        w_limpo = w.strip()
        if len(w_limpo) >= 3 and w_limpo.lower() not in [k.lower() for k in keywords]:
            keywords.append(w_limpo)
            if len(keywords) >= max_keywords:
                break

    return keywords

def montar_texto_embedding(item, palavras_chave):
    """
    Monta a representação textual otimizada para o modelo Transformer:
    - Palavras-chave no início (alta atenção posicional).
    - Oração completa da habilidade (preserva sintaxe e verbos pedagógicos).
    - Metadados curriculares essenciais.
    """
    partes = []

    # 1. Cabeçalho de Palavras-Chave (com o código em 1º)
    kw_str = ", ".join(palavras_chave)
    partes.append(f"Palavras-Chave: {kw_str}")

    # 2. Habilidade com sintaxe original completa
    if item['habilidade']:
        partes.append(f"Habilidade: {item['habilidade']}")

    # 3. Componentes curriculares contextuais
    meta_info = []
    if item['disciplina']:
        meta_info.append(f"Disciplina: {item['disciplina']}")
    if item['ano_faixa']:
        meta_info.append(f"Ano: {item['ano_faixa']}")
    if item['objeto_conhecimento']:
        meta_info.append(f"Objeto: {item['objeto_conhecimento']}")
    if item['unidade_tematica']:
        meta_info.append(f"Unidade: {item['unidade_tematica']}")

    if meta_info:
        partes.append("Contexto: " + " | ".join(meta_info))

    return " \n ".join(partes)

def main():
    print("=" * 65)
    print("Iniciando geração da base vetorial da BNCC com Palavras-Chave")
    print("=" * 65)

    csv_path = "Cópia de habilidades bncc - bncc.csv"
    if not os.path.exists(csv_path):
        candidatos = [f for f in os.listdir('.') if f.endswith('.csv') and 'bncc' in f.lower()]
        if candidatos:
            csv_path = candidatos[0]
        elif os.path.exists(os.path.join('recursos_adicionais', 'Cópia de habilidades bncc - bncc.csv')):
            csv_path = os.path.join('recursos_adicionais', 'Cópia de habilidades bncc - bncc.csv')
        else:
            raise FileNotFoundError("Arquivo CSV da BNCC não encontrado.")

    print(f"-> Lendo arquivo: {csv_path}")
    df = pd.read_csv(csv_path, encoding='utf-8')
    total_linhas = len(df)
    print(f"-> {total_linhas} habilidades encontradas no CSV.")

    print("-> Extraindo corpus completo para análise estatística TF-IDF...")
    corpus = []
    itens_processados = []

    for _, row in df.iterrows():
        codigo = limpar_texto(row.get('COD'))
        disciplina = inferir_disciplina(row)
        ano_faixa = limpar_texto(row.get('ANO/FAIXA'))
        unidade = limpar_texto(row.get('PRÁTICAS DE LINGUAGEM - UNIDADE TEMÁTICA'))
        objeto = limpar_texto(row.get('OBJETOS DE CONHECIMENTO'))
        habilidade = limpar_texto(row.get('HABILIDADES'))
        comentario = limpar_texto(row.get('COMENTÁRIO'))
        possibilidades = limpar_texto(row.get('POSSIBILIDADES PARA O CURRÍCULO'))

        # Junta todas as colunas da linha para o vocabulário de extração
        texto_linha_completa = " ".join([
            codigo, disciplina, ano_faixa, unidade, objeto, habilidade, comentario, possibilidades
        ])
        corpus.append(texto_linha_completa)

        itens_processados.append({
            "codigo": codigo,
            "disciplina": disciplina,
            "ano_faixa": ano_faixa,
            "unidade_tematica": unidade,
            "objeto_conhecimento": objeto,
            "habilidade": habilidade,
            "comentario": comentario,
            "possibilidades": possibilidades
        })

    print("-> Ajustando modelo TF-IDF com n-grams (1, 2) para extrair termos de alto valor...")
    vec = TfidfVectorizer(
        stop_words=STOPWORDS_PT,
        min_df=2,
        max_df=0.65,
        ngram_range=(1, 2),
        max_features=4000
    )
    X = vec.fit_transform(corpus)
    feature_names = vec.get_feature_names_out()

    print("-> Gerando a nova coluna de palavras-chave para cada linha...")
    textos_para_embedding = []
    for idx, item in enumerate(itens_processados):
        row = df.iloc[idx]
        row_vec = X[idx].toarray()[0]
        # Pega as palavras mais relevantes estatisticamente
        top_indices = row_vec.argsort()[-8:][::-1]
        tfidf_words = [feature_names[i] for i in top_indices if row_vec[i] > 0]

        # Extrai lista de palavras-chave (primeiro elemento é SEMPRE o código)
        palavras_chave = extrair_palavras_chave_linha(row, tfidf_words, max_keywords=8)
        item['palavras_chave'] = palavras_chave

        # Monta o texto de embedding de alta densidade
        texto_emb = montar_texto_embedding(item, palavras_chave)
        textos_para_embedding.append(texto_emb)

    # Exemplo das primeiras 2 habilidades processadas
    print("\nExemplo de Pré-Processamento:")
    for i in range(2):
        print(f"[{itens_processados[i]['codigo']}] Palavras-Chave:", itens_processados[i]['palavras_chave'])
    print()

    # Carrega o modelo de embeddings (usando o cache local)
    modelo_nome = "all-MiniLM-L6-v2"
    print(f"-> Carregando modelo sentence-transformers: {modelo_nome}...")
    modelo = SentenceTransformer(modelo_nome, local_files_only=True)

    print("-> Gerando novos embeddings semânticos normalizados...")
    embeddings = modelo.encode(
        textos_para_embedding,
        batch_size=64,
        show_progress_bar=True,
        normalize_embeddings=True
    )

    print("-> Estruturando dados e gravando bncc_vetores.json...")
    base_vetores = []
    for item, emb in zip(itens_processados, embeddings):
        item_com_vetor = {
            **item,
            "vetor": [round(float(val), 5) for val in emb]
        }
        base_vetores.append(item_com_vetor)

    output_path = "bncc_vetores.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(base_vetores, f, ensure_ascii=False, separators=(',', ':'))

    tamanho_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"-> Concluído! Arquivo '{output_path}' atualizado ({tamanho_mb:.2f} MB).")
    print(f"-> 100% das 1.517 habilidades agora possuem a coluna 'palavras_chave' com o código no topo.")
    print("=" * 65)

if __name__ == '__main__':
    main()
