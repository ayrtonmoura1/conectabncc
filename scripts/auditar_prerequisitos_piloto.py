#!/usr/bin/env python3
"""Audit a bounded sample without changing the active or generated graph."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from gerar_relacoes_bncc_v2_maritaca import (
    ROOT, STATE_DIR, USAGE_FILE, PersistentQuotaGuard, call_model_with_fallback,
    get_api_key, pairwise_similarity_map, _temporal_position,
)
from relacoes_bncc_v2 import atomic_write_json, normalized_component, read_json


def context(item: dict) -> dict:
    return {key: item.get(key) for key in (
        'codigo', 'disciplina', 'ano_faixa', 'habilidade', 'unidade_tematica',
        'objeto_conhecimento', 'comentario', 'possibilidades', 'objetivos_aprendizagem',
        'fonte_pedagogica_reuna',
    ) if item.get(key)}


def sample_targets(base: list[dict], edges: list[dict]) -> list[dict]:
    involved = {code for edge in edges for code in (edge['de'], edge['para'])}
    return [item for item in base if item['codigo'] not in involved]


def candidate_pool(target: dict, base: list[dict]) -> list[dict]:
    return [item for item in base if item['codigo'] != target['codigo']
            and normalized_component(item) == normalized_component(target)
            and _temporal_position(item, target) == 'anterior']


def prompt_for(target: dict, candidates: list[dict]) -> str:
    payload = {'alvo': context(target), 'candidatas': [context(item) for item in candidates]}
    return """Você é avaliador de progressão curricular brasileira. Analise cada candidata de modo independente.
Somente classifique como prerequisito quando a aprendizagem específica da candidata for realmente necessária
para desenvolver o alvo; semelhança, tema comum e ano anterior não bastam. Se apenas ajuda, classifique apoio;
se amplia, retomada; se não há fundamento, rejeitada; se não é possível avaliar, incerta.
Comentários, possibilidades e objetivos complementares são contexto de suas respectivas fontes, não provas
de que a BNCC declarou um pré-requisito oficial. Não atribua texto ausente a nenhuma fonte.
Retorne JSON com uma avaliação para CADA candidata, usando exatamente este formato:
{"avaliacoes":[{"codigo":"CODIGO","classificacao":"prerequisito|apoio|retomada|rejeitada|incerta",
"justificativa":"texto específico","evidencias":[{"codigo":"CODIGO", "campo":"habilidade|objeto_conhecimento|comentario|possibilidades|objetivos_aprendizagem", "trecho":"citação literal"}]}]}
As citações devem reproduzir literalmente trechos dos campos fornecidos. Não invente códigos.
DADOS:\n""" + json.dumps(payload, ensure_ascii=False, separators=(',', ':'))


def validate(response: dict, target: dict, candidates: list[dict]) -> list[dict]:
    items = {item['codigo']: item for item in [target, *candidates]}
    expected = {item['codigo'] for item in candidates}
    raw = response.get('avaliacoes')
    if not isinstance(raw, list):
        raise ValueError('Resposta sem lista de avaliações')
    found = {}
    for result in raw:
        if not isinstance(result, dict):
            raise ValueError('Avaliação inválida')
        code = result.get('codigo')
        if code not in expected or code in found:
            raise ValueError('Código fora da lista ou duplicado')
        if result.get('classificacao') not in {'prerequisito', 'apoio', 'retomada', 'rejeitada', 'incerta'}:
            raise ValueError(f'Classificação inválida: {code}')
        evidence = result.get('evidencias') or []
        for entry in evidence:
            if not isinstance(entry, dict) or entry.get('codigo') not in {code, target['codigo']}:
                raise ValueError(f'Evidência com código inválido: {code}')
            source = items[entry['codigo']].get(entry.get('campo'))
            text = entry.get('trecho')
            if not isinstance(source, str) or not isinstance(text, str) or len(text.strip()) < 8 or text not in source:
                raise ValueError(f'Evidência não literal: {code}')
        if result['classificacao'] == 'prerequisito' and {entry['codigo'] for entry in evidence} != {code, target['codigo']}:
            raise ValueError(f'Pré-requisito sem evidência literal nos dois itens: {code}')
        found[code] = result
    if set(found) != expected:
        raise ValueError('Resposta não cobre todas as candidatas do lote')
    return [found[item['codigo']] for item in candidates]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='executar uma chamada de piloto')
    parser.add_argument('--target', help='código entre as habilidades sem nenhuma relação')
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--output', default=str(ROOT / 'auditoria_prerequisitos_piloto.json'))
    args = parser.parse_args()
    if args.batch_size < 1:
        parser.error('--batch-size deve ser positivo')
    base = read_json(ROOT / 'bncc_vetores.json')
    graph = read_json(ROOT / 'relacoes_bncc_v2_progressao.json')
    targets = sample_targets(base, graph['arestas'])
    print(f'Habilidades sem relação: {len(targets)}')
    for target in targets:
        print(f"{target['codigo']}: {len(candidate_pool(target, base))} candidatas de períodos anteriores no componente")
    if not args.run:
        return
    target = next((item for item in targets if item['codigo'] == args.target), None)
    if not target:
        raise SystemExit('Escolha com --target uma habilidade sem relação listada acima.')
    candidates = candidate_pool(target, base)
    if not candidates:
        raise SystemExit('Não há candidatas anteriores no mesmo componente para este alvo.')
    output = Path(args.output)
    if output.exists():
        raise SystemExit(f'Saída já existe; escolha outro caminho para não sobrescrever: {output}')
    codes, similarities = pairwise_similarity_map(base)
    candidates.sort(key=lambda item: -float(similarities[codes[target['codigo']], codes[item['codigo']]]))
    batch = candidates[:args.batch_size]
    api_key = get_api_key()
    if not api_key:
        raise SystemExit('MARITACA_API_KEY não configurada.')
    free = PersistentQuotaGuard(STATE_DIR / '_usage_s5_free.json', 60, 256_000, 500, 5_000_000)
    paid = PersistentQuotaGuard(USAGE_FILE, 12, 64_000, 500, 5_000_000, max_total_cost_brl=20.0)
    response, usage, model = call_model_with_fallback(api_key, prompt_for(target, batch), free, paid, 6000)
    evaluations = validate(response, target, batch)
    atomic_write_json(output, {
        'status': 'piloto_parcial_sem_verificacao_independente', 'alvo': target['codigo'],
        'totalCandidatasAnterioresMesmoComponente': len(candidates),
        'candidatasExaminadas': [item['codigo'] for item in batch],
        'modelo': model, 'usage': usage, 'avaliacoes': evaluations,
        'aviso': 'Não integrado ao grafo; pendem avaliação das demais candidatas e revisão independente.',
    })
    print(f'Piloto salvo: {output}; candidatas examinadas {len(batch)}/{len(candidates)}; modelo {model}.')


if __name__ == '__main__':
    main()
