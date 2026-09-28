# -*- coding: utf-8 -*-
"""
extrair_progressao_foco.py
Extrai a matriz oficial de Pré-requisitos, Habilidades de Apoio,
Conhecimentos Prévios e Cadeias de Progressão da BNCC a partir da planilha
MapasDeFocoBncc_Unificados.xlsx (Instituto Reúna / Fundação Lemann / Itaú Social).
"""

import openpyxl
import re
import json
import os

EXCEL_FILE = 'MapasDeFocoBncc_Unificados.xlsx'
if not os.path.exists(EXCEL_FILE) and os.path.exists(os.path.join('recursos_adicionais', 'MapasDeFocoBncc_Unificados.xlsx')):
    EXCEL_FILE = os.path.join('recursos_adicionais', 'MapasDeFocoBncc_Unificados.xlsx')
OUTPUT_JSON = 'bncc_progressao_pre_requisitos.json'
VETORES_FILE = 'bncc_vetores.json'

def extract_codes(text):
    if not text:
        return []
    raw = re.findall(r'[A-Z]{2}[0-9]{2}[A-Z]{2,3}[0-9]{2,3}', str(text).upper())
    corrected = []
    for c in raw:
        if len(c) > 8 and c.startswith('EFMA'):
            c = c.replace('EFMA', 'EF')
        corrected.append(c)
    return corrected

def get_skill_year_val(codigo):
    pref = codigo[:4]
    if pref.startswith('EI'): return 0.0
    if pref.startswith('EM'): return 11.0
    digits = ''.join(c for c in pref[2:] if c.isdigit())
    if digits:
        n = int(digits)
        if n <= 9: return float(n)
        if n == 12: return 1.5
        if n == 35: return 3.5
        if n == 15: return 1.2
        if n == 67: return 6.5
        if n == 89: return 8.5
        if n == 69: return 6.9
    return 5.0

def get_skill_label_etapa(codigo):
    pref = codigo[:4]
    if pref.startswith('EI'): return 'Educação Infantil'
    if pref.startswith('EM'): return 'Ensino Médio'
    digits = ''.join(c for c in pref[2:] if c.isdigit())
    if digits:
        n = int(digits)
        if n <= 9: return f'{n}º Ano'
        if n == 12: return '1º e 2º Anos'
        if n == 35: return '3º ao 5º Anos'
        if n == 15: return '1º ao 5º Anos'
        if n == 67: return '6º e 7º Anos'
        if n == 89: return '8º e 9º Anos'
        if n == 69: return '6º ao 9º Anos'
    return 'Geral'

def main():
    print(f'Carregando {EXCEL_FILE}...')
    wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    
    base_skills = {}
    if os.path.exists(VETORES_FILE):
        with open(VETORES_FILE, 'r', encoding='utf-8') as f:
            v_data = json.load(f)
            for item in v_data:
                base_skills[item['codigo']] = item

    prog_data = {}

    def ensure_skill(cod):
        if cod not in prog_data:
            meta = base_skills.get(cod, {})
            prog_data[cod] = {
                'classificacao': '',
                'unidade': meta.get('campo_atuacao') or meta.get('unidade_tematica') or '',
                'pre_mesmo': [],
                'pre_ant': [],
                'apoio': [],
                'post_mesmo': [],
                'post_seg': [],
                'comentario': '',
                'cadeias': []
            }
        return prog_data[cod]

    # 1. Varre as 38 abas específicas de anos/fases
    print('Extraindo conhecimentos prévios e habilidades relacionadas das abas de anos...')
    for sheet_name in wb.sheetnames:
        s = wb[sheet_name]
        header_row = None
        col_map = {}
        for r in range(1, 6):
            for c in range(1, 15):
                val = str(s.cell(r, c).value or '').lower()
                if 'código da habilidade' in val or 'cdigo da habilidade' in val:
                    header_row = r
                    col_map['codigo'] = c
                elif 'conhecimento pr' in val:
                    col_map['prev'] = c
                elif 'habilidades relacionadas' in val:
                    col_map['rel'] = c
                elif 'unidade tem' in val or 'campo de atua' in val:
                    col_map['unidade'] = c
                elif 'classifica' in val:
                    col_map['classificacao'] = c
                elif 'coment' in val:
                    col_map['comentarios'] = c
            if header_row:
                break
                
        if header_row and 'codigo' in col_map:
            for r in range(header_row + 1, s.max_row + 1):
                cod_raw = s.cell(r, col_map['codigo']).value
                cods = extract_codes(cod_raw)
                if not cods:
                    continue
                prev_cods = extract_codes(s.cell(r, col_map.get('prev', 999)).value) if 'prev' in col_map else []
                rel_cods = extract_codes(s.cell(r, col_map.get('rel', 999)).value) if 'rel' in col_map else []
                coment = str(s.cell(r, col_map.get('comentarios', 999)).value or '').strip()
                classif = str(s.cell(r, col_map.get('classificacao', 999)).value or '').strip()
                unidade = str(s.cell(r, col_map.get('unidade', 999)).value or '').strip()
                
                for cod in cods:
                    obj = ensure_skill(cod)
                    if classif and not obj['classificacao']: obj['classificacao'] = classif
                    if unidade and not obj['unidade']: obj['unidade'] = unidade
                    if coment and not obj['comentario']: obj['comentario'] = coment

                    cod_y = get_skill_year_val(cod)

                    # Separa pré-requisitos do mesmo ano vs anos anteriores
                    for p in prev_cods:
                        if p == cod: continue
                        ensure_skill(p)
                        p_y = get_skill_year_val(p)

                        # Diferenciação exata: MESMO ANO vs ANOS ANTERIORES
                        if abs(p_y - cod_y) < 0.1:
                            if p not in obj['pre_mesmo']:
                                obj['pre_mesmo'].append(p)
                        elif p_y < cod_y:
                            if p not in obj['pre_ant']:
                                obj['pre_ant'].append(p)
                        else:
                            if p not in obj['pre_mesmo']:
                                obj['pre_mesmo'].append(p)

                    # Habilidades relacionadas / complementares do mesmo ano
                    for r_c in rel_cods:
                        if r_c == cod: continue
                        ensure_skill(r_c)
                        if r_c not in obj['apoio']:
                            obj['apoio'].append(r_c)

    # 2. Varre as 8 abas de Progressão Geral dos Ciclos
    print('Extraindo cadeias horizontais de progressão entre anos...')
    prog_sheets = [s for s in wb.sheetnames if 'Progress' in s or 'Vis' in s]

    for sname in prog_sheets:
        s = wb[sname]
        header_r = None
        for r in range(1, 15):
            row_str = ' '.join(str(s.cell(r, c).value or '') for c in range(1, 15))
            if ('1º' in row_str or '1o' in row_str or '6º' in row_str or '6o' in row_str) and ('2º' in row_str or '2o' in row_str or '7º' in row_str or '7o' in row_str):
                header_r = r
                break
        if not header_r:
            continue

        for r in range(header_r + 1, s.max_row + 1):
            line_skills = []
            for c in range(1, 15):
                val = s.cell(r, c).value
                cods = extract_codes(val)
                for cod in cods:
                    if cod not in line_skills:
                        line_skills.append(cod)
            if len(line_skills) >= 2:
                for i in range(len(line_skills)):
                    curr = line_skills[i]
                    curr_obj = ensure_skill(curr)
                    if line_skills not in curr_obj['cadeias']:
                        curr_obj['cadeias'].append(line_skills)

                    curr_y = get_skill_year_val(curr)
                    # Passos anteriores na cadeia
                    for j in range(0, i):
                        prev = line_skills[j]
                        prev_y = get_skill_year_val(prev)
                        if abs(prev_y - curr_y) < 0.1:
                            if prev not in curr_obj['pre_mesmo']:
                                curr_obj['pre_mesmo'].append(prev)
                        elif prev_y < curr_y:
                            if prev not in curr_obj['pre_ant']:
                                curr_obj['pre_ant'].append(prev)

                    # Passos seguintes na cadeia
                    for k in range(i + 1, len(line_skills)):
                        prox = line_skills[k]
                        prox_y = get_skill_year_val(prox)
                        if abs(prox_y - curr_y) < 0.1:
                            if prox not in curr_obj['post_mesmo']:
                                curr_obj['post_mesmo'].append(prox)
                        elif prox_y > curr_y:
                            if prox not in curr_obj['post_seg']:
                                curr_obj['post_seg'].append(prox)

    # 3. Calcula os links reversos (quem tem quem como posterior)
    print('Calculando links reversos de dependência e desdobramentos futuros...')
    for cod, obj in list(prog_data.items()):
        for p in obj['pre_mesmo']:
            target = ensure_skill(p)
            if cod not in target['post_mesmo']:
                target['post_mesmo'].append(cod)

        for p in obj['pre_ant']:
            target = ensure_skill(p)
            if cod not in target['post_seg']:
                target['post_seg'].append(cod)

    # 4. Conexões de 9º ano com Ensino Médio
    print('Mapeando progressão do 9º ano para o Ensino Médio...')
    em_skills = [s for s in base_skills.values() if s['codigo'].startswith('EM')]
    
    em_by_area = {
        'Língua Portuguesa': [s for s in em_skills if 'LGG' in s['codigo'] or 'LP' in s['codigo']],
        'Matemática': [s for s in em_skills if 'MAT' in s['codigo']],
        'Ciências': [s for s in em_skills if 'CNT' in s['codigo']],
        'História': [s for s in em_skills if 'CHS' in s['codigo']],
        'Geografia': [s for s in em_skills if 'CHS' in s['codigo']],
        'Arte': [s for s in em_skills if 'LGG' in s['codigo']],
        'Educação Física': [s for s in em_skills if 'LGG' in s['codigo']],
    }

    def dot_product(v1, v2):
        return sum(a * b for a, b in zip(v1, v2))

    for cod, obj in list(prog_data.items()):
        if cod.startswith('EF09') or cod.startswith('EF89'):
            disc = base_skills.get(cod, {}).get('disciplina', '')
            candidatos_em = em_by_area.get(disc, [])
            skill_meta = base_skills.get(cod)
            if skill_meta and 'vetor' in skill_meta and candidatos_em:
                scores = []
                for em_s in candidatos_em:
                    if 'vetor' in em_s:
                        sim = dot_product(skill_meta['vetor'], em_s['vetor'])
                        scores.append((em_s['codigo'], sim))
                scores.sort(key=lambda x: x[1], reverse=True)
                for top_em, sim_val in scores[:2]:
                    if sim_val >= 0.50:
                        ensure_skill(top_em)
                        if top_em not in obj['post_seg']:
                            obj['post_seg'].append(top_em)
                        if cod not in prog_data[top_em]['pre_ant']:
                            prog_data[top_em]['pre_ant'].append(cod)

    print(f'Total de habilidades com inteligência de progressão mapeada: {len(prog_data)}')
    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(prog_data, f, ensure_ascii=False, indent=2)

    print(f'Sucesso! Base de progressão e pré-requisitos salva em {OUTPUT_JSON} ({os.path.getsize(OUTPUT_JSON)} bytes).')

if __name__ == '__main__':
    main()
