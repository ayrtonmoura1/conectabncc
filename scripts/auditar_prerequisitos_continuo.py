#!/usr/bin/env python3
"""Auditoria retomável das habilidades isoladas, sem modificar os grafos existentes."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from auditar_prerequisitos_piloto import candidate_pool, prompt_for, sample_targets, validate
from gerar_relacoes_bncc_v2_maritaca import (
    ROOT, STATE_DIR, USAGE_FILE, PersistentQuotaGuard, QuotaLimitReached,
    call_model, call_model_with_fallback, get_api_key, MODEL,
)
from relacoes_bncc_v2 import atomic_write_json, read_json

VERSION = 'auditoria-sem-relacao-1'


def fingerprint(base_path: Path, graph_path: Path) -> str:
    h = hashlib.sha256()
    for path in (base_path, graph_path):
        h.update(hashlib.sha256(path.read_bytes()).digest())
    h.update(VERSION.encode())
    return h.hexdigest()


def init_state(path: Path, digest: str) -> dict:
    if path.exists():
        state = read_json(path)
        if state.get('fingerprint') != digest:
            raise ValueError('Fontes ou versão diferentes do checkpoint; use outro arquivo de saída.')
        return state
    return {'versao': VERSION, 'fingerprint': digest, 'alvos': {},
            'aviso': 'Auditoria experimental separada; vínculos não são incorporados automaticamente ao grafo.'}


def selected_pending(target_state: dict, candidates: list[dict], batch_size: int) -> list[dict]:
    examined = target_state.get('avaliacoes', {})
    return [item for item in candidates if item['codigo'] not in examined][:batch_size]


def review_status(initial: str, independent: str) -> str:
    if initial == independent:
        return 'concordante_nao_homologada'
    return 'divergente_revisao_humana'


def validate_partial(response: dict, target: dict, batch: list[dict]) -> tuple[list[dict], list[str]]:
    """Keep valid individual judgments; a malformed neighbor must not erase them."""
    raw = response.get('avaliacoes')
    if not isinstance(raw, list):
        raise ValueError('Resposta sem lista de avaliações')
    grouped: dict[str, list] = {}
    for item in raw:
        if isinstance(item, dict) and isinstance(item.get('codigo'), str):
            grouped.setdefault(item['codigo'], []).append(item)
    accepted, errors = [], []
    for candidate in batch:
        code = candidate['codigo']
        try:
            accepted.extend(validate({'avaliacoes': grouped.get(code, [])}, target, [candidate]))
        except ValueError as exc:
            errors.append(f'{code}: {exc}')
    return accepted, errors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--target', default='EF05CI09')
    parser.add_argument('--output', default=str(ROOT / 'auditoria_prerequisitos_continuo.json'))
    parser.add_argument('--batch-size', type=int, default=4)
    parser.add_argument('--limit-batches', type=int, default=0, help='0 examina todos os lotes pendentes')
    parser.add_argument('--model', choices=('auto', 'sabiazinho-4'), default='auto', help='usar modelo pago diretamente ou S5-free com fallback')
    parser.add_argument('--skip-reviews', action='store_true', help='adiar as revisões independentes desta execução')
    parser.add_argument('--run', action='store_true')
    args = parser.parse_args()
    if args.batch_size < 1 or args.limit_batches < 0:
        parser.error('tamanho de lote deve ser positivo e limite de lotes não negativo')

    base_path, graph_path = ROOT / 'bncc_vetores.json', ROOT / 'relacoes_bncc_v2_progressao.json'
    base, graph = read_json(base_path), read_json(graph_path)
    targets = sample_targets(base, graph['arestas'])
    target = next((item for item in targets if item['codigo'] == args.target), None)
    if not target:
        raise ValueError('Alvo não pertence à lista original de habilidades sem nenhuma relação.')
    candidates = sorted(candidate_pool(target, base), key=lambda item: item['codigo'])
    output = Path(args.output)
    state = init_state(output, fingerprint(base_path, graph_path))
    target_state = state['alvos'].setdefault(args.target, {
        'totalCandidatas': len(candidates), 'criterio': 'mesmo componente e período estritamente anterior',
        'avaliacoes': {}, 'revisoes': {}, 'erros': [],
    })
    print(f"{args.target}: {len(target_state['avaliacoes'])}/{len(candidates)} candidatas examinadas; {len(target_state['revisoes'])} revisões.", flush=True)
    if not args.run:
        return
    if not candidates:
        target_state['status'] = 'sem_candidatas_mesmo_componente_requer_busca_outra_etapa'
        atomic_write_json(output, state)
        return
    key = get_api_key()
    if not key:
        raise ValueError('MARITACA_API_KEY não configurada.')
    free = PersistentQuotaGuard(STATE_DIR / '_usage_s5_free.json', 60, 256_000, 500, 5_000_000)
    paid = PersistentQuotaGuard(USAGE_FILE, 12, 64_000, 500, 5_000_000, max_total_cost_brl=20.0)
    def request(prompt: str) -> tuple[dict, dict, str]:
        if args.model == MODEL:
            response, usage = call_model(key, prompt, paid, 6000, model=MODEL)
            return response, usage, MODEL
        return call_model_with_fallback(key, prompt, free, paid, 6000)
    completed = 0
    interrupted = False
    while True:
        batch = selected_pending(target_state, candidates, args.batch_size)
        if not batch or (args.limit_batches and completed >= args.limit_batches):
            break
        try:
            result, usage, model = request(prompt_for(target, batch))
            evaluations, invalid = validate_partial(result, target, batch)
        except QuotaLimitReached as exc:
            print(f'Cota atingida; checkpoint preservado: {exc}', flush=True)
            interrupted = True
            break
        except Exception as exc:
            target_state['erros'].append({'fase': 'avaliacao', 'codigos': [x['codigo'] for x in batch], 'motivo': f'{type(exc).__name__}: {str(exc)[:300]}'})
            atomic_write_json(output, state)
            print('Lote não validado; checkpoint preservado para nova tentativa.', flush=True)
            interrupted = True
            break
        for result in evaluations:
            target_state['avaliacoes'][result['codigo']] = {'resultado': result, 'modelo': model, 'usageLote': usage}
        if invalid:
            target_state['erros'].append({'fase': 'avaliacao', 'codigos': [x['codigo'] for x in batch], 'motivo': '; '.join(invalid)[:1200]})
        completed += 1
        atomic_write_json(output, state)
        print(f"{args.target}: {len(target_state['avaliacoes'])}/{len(candidates)} examinadas | {model}", flush=True)
        if invalid:
            print(f'{len(invalid)} avaliação(ões) inválida(s) permanecerão pendentes; interrompendo para retomada.', flush=True)
            interrupted = True
            break

    if interrupted:
        target_state['status'] = 'parcial'
        atomic_write_json(output, state)
        return

    if args.skip_reviews:
        target_state['status'] = 'parcial'
        atomic_write_json(output, state)
        print('Revisões independentes adiadas; checkpoint preservado.', flush=True)
        return

    by_code = {item['codigo']: item for item in candidates}
    positives = [code for code, entry in target_state['avaliacoes'].items()
                 if entry['resultado']['classificacao'] in {'prerequisito', 'apoio', 'retomada'}
                 and code not in target_state['revisoes']]
    for code in positives:
        try:
            # A second fresh request receives the two source items, not the first decision.
            result, usage, model = request(prompt_for(target, [by_code[code]]))
            independent = validate(result, target, [by_code[code]])[0]
        except QuotaLimitReached as exc:
            print(f'Cota atingida durante revisão; checkpoint preservado: {exc}', flush=True)
            break
        except Exception as exc:
            target_state['erros'].append({'fase': 'revisao', 'codigos': [code], 'motivo': f'{type(exc).__name__}: {str(exc)[:300]}'})
            atomic_write_json(output, state)
            print(f'Revisão de {code} não validada; permanecerá pendente.', flush=True)
            continue
        initial = target_state['avaliacoes'][code]['resultado']['classificacao']
        target_state['revisoes'][code] = {'resultado': independent, 'modelo': model, 'usage': usage,
                                         'status': review_status(initial, independent['classificacao'])}
        atomic_write_json(output, state)
        print(f"Revisão {code}: {target_state['revisoes'][code]['status']} | {model}", flush=True)
    pending_reviews = [code for code in positives if code not in target_state['revisoes']]
    target_state['status'] = ('avaliacao_completa_requer_revisao_humana'
                              if len(target_state['avaliacoes']) == len(candidates) and not pending_reviews
                              else 'parcial')
    atomic_write_json(output, state)
    print(f"Status: {target_state['status']} | saída: {output}", flush=True)


if __name__ == '__main__':
    main()
