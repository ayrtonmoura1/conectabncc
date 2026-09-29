import json
import os
import sys

def main():
    json_path = 'relacoes_bncc_final.json'
    if not os.path.exists(json_path):
        print(f"ERRO: Arquivo {json_path} não encontrado!")
        sys.exit(1)

    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total_skills = len(data)
    print(f"==================================================")
    print(f" RELATÓRIO DE VALIDAÇÃO DE RELAÇÕES FINAIS BNCC")
    print(f"==================================================")
    print(f"Total de habilidades catalogadas: {total_skills}")

    all_keys = set(data.keys())

    total_requisitos = 0
    total_prepara = 0
    total_relacionadas = 0
    erros = []

    for codigo, entry in data.items():
        # Validação de schema
        for required_field in ['descricao', 'componente', 'ano_fase', 'requisitos', 'prepara_para', 'relacionadas', 'objetos_conhecimento']:
            if required_field not in entry:
                erros.append(f"{codigo}: campo obrigatório '{required_field}' ausente.")

        # Requisitos (max 3)
        reqs = entry.get('requisitos', [])
        if len(reqs) > 3:
            erros.append(f"{codigo}: requisitos excede o limite de 3 ({len(reqs)})")
        for r in reqs:
            if not isinstance(r, dict) or 'codigo' not in r or 'justificativa' not in r:
                erros.append(f"{codigo}: formato de requisito inválido: {r}")
            elif r['codigo'] not in all_keys:
                erros.append(f"{codigo}: requisito alucinado '{r['codigo']}' não existe na BNCC.")
        total_requisitos += len(reqs)

        # Prepara para (max 3)
        preps = entry.get('prepara_para', [])
        if len(preps) > 3:
            erros.append(f"{codigo}: prepara_para excede o limite de 3 ({len(preps)})")
        for p in preps:
            if not isinstance(p, dict) or 'codigo' not in p or 'justificativa' not in p:
                erros.append(f"{codigo}: formato de prepara_para inválido: {p}")
            elif p['codigo'] not in all_keys:
                erros.append(f"{codigo}: prepara_para alucinado '{p['codigo']}' não existe na BNCC.")
        total_prepara += len(preps)

        # Relacionadas (max 5)
        rels = entry.get('relacionadas', [])
        if len(rels) > 5:
            erros.append(f"{codigo}: relacionadas excede o limite de 5 ({len(rels)})")
        for rel in rels:
            if not isinstance(rel, dict) or 'codigo' not in rel or 'justificativa' not in rel:
                erros.append(f"{codigo}: formato de relacionada inválido: {rel}")
            elif rel['codigo'] not in all_keys:
                erros.append(f"{codigo}: relacionada alucinada '{rel['codigo']}' não existe na BNCC.")
        total_relacionadas += len(rels)

    print(f"Total de vínculos de requisitos: {total_requisitos} (média {total_requisitos/total_skills:.2f}/habilidade)")
    print(f"Total de vínculos prepara_para: {total_prepara} (média {total_prepara/total_skills:.2f}/habilidade)")
    print(f"Total de vínculos interdisciplinares: {total_relacionadas} (média {total_relacionadas/total_skills:.2f}/habilidade)")
    print(f"Erros encontrados: {len(erros)}")
    if erros:
        print("Primeiros 5 erros:")
        for e in erros[:5]:
            print(" - ", e)
    else:
        print(">> SUCESSO ABSOLUTO: 0 erros, 0 alucinações, todos os limites respeitados!")

    sample_codes = ['EF06MA01', 'EF05MA02', 'EF07MA04', 'EF01LP01', 'EM13CNT101']
    print(f"\n==================================================")
    print(f" EXEMPLOS DE ESTRUTURAÇÃO PEDAGÓGICA (AMOSTRA)")
    print(f"==================================================")
    for sc in sample_codes:
        if sc in data:
            it = data[sc]
            print(f"\n[Habilidade Alvo: {sc}]")
            print(f"Componente: {it.get('componente')} | Ano/Fase: {it.get('ano_fase')}")
            print(f"Descrição: {it.get('descricao')[:90]}...")
            print(f"Objetos de Conhecimento: {it.get('objetos_conhecimento')}")
            print(f"Requisitos ({len(it.get('requisitos', []))}):")
            for r in it.get('requisitos', []):
                print(f"  <- {r['codigo']}: {r['justificativa']}")
            print(f"Prepara Para ({len(it.get('prepara_para', []))}):")
            for p in it.get('prepara_para', []):
                print(f"  -> {p['codigo']}: {p['justificativa']}")
            print(f"Relacionadas Interdisciplinares ({len(it.get('relacionadas', []))}):")
            for rel in it.get('relacionadas', []):
                print(f"  <-> {rel['codigo']}: {rel['justificativa']}")

if __name__ == '__main__':
    main()
