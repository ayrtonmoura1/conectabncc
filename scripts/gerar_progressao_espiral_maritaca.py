#!/usr/bin/env python3
"""Gera relações pedagógicas sugeridas por IA para Matemática no EF (todas as unidades).

As relações são inferências da Maritaca, não dependências oficiais declaradas pela
BNCC. O arquivo público de saída contém somente códigos já existentes na base BNCC.
"""
from __future__ import annotations

import argparse
from collections import defaultdict, deque
import json
import math
import os
import random
import re
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
BASE_FILE = ROOT / "bncc_vetores.json"
OUTPUT = ROOT / "progressao_espiral_matematica.json"
STATE_DIR = ROOT / "progressao_espiral"
CHECKPOINT = STATE_DIR / "_checkpoint.json"
API_URL = "https://chat.maritaca.ai/api/chat/completions"
MODELS = ("S5-free",)
MAX_RPM = 60
MAX_TPM = 256_000
MAX_OUTPUT_TOKENS = 4_200
MAX_PROMPT_CHARS = 80_000
MAX_CANDIDATES_PER_TARGET = 24
UNITS = (
    "Números",
    "Álgebra",
    "Geometria",
    "Grandezas e medidas",
    "Probabilidade e estatística",
)
RELATION_TYPES = {
    "pre_requisito_direto",
    "retomada_espiral",
    "apoio",
    "paralela",
}
RELATION_PRIORITY = {
    "pre_requisito_direto": 0,
    "retomada_espiral": 1,
    "apoio": 2,
    "paralela": 3,
}


class SlidingWindowRateLimiter:
    """Conservatively reserve input + maximum output in the provider's 60s window."""

    def __init__(self, requests_per_minute: int = MAX_RPM, tokens_per_minute: int = MAX_TPM):
        self.max_requests = min(MAX_RPM, max(1, requests_per_minute))
        self.max_tokens = min(MAX_TPM, max(1, tokens_per_minute))
        self.events: deque[tuple[int, float, int]] = deque()
        self.lock = threading.Lock()
        self.next_reservation_id = 0

    def acquire(self, estimated_tokens: int) -> tuple[float, int]:
        estimated_tokens = max(1, int(estimated_tokens))
        if estimated_tokens > self.max_tokens:
            raise ValueError(
                f"A solicitação exige aproximadamente {estimated_tokens:,} tokens, acima do limite por minuto."
            )
        waited = 0.0
        while True:
            with self.lock:
                now = time.monotonic()
                while self.events and now - self.events[0][1] >= 60:
                    self.events.popleft()
                used_tokens = sum(tokens for _, _, tokens in self.events)
                if len(self.events) < self.max_requests and used_tokens + estimated_tokens <= self.max_tokens:
                    self.next_reservation_id += 1
                    reservation_id = self.next_reservation_id
                    self.events.append((reservation_id, now, estimated_tokens))
                    return waited, reservation_id
                delay = max(0.05, 60 - (now - self.events[0][1]) + 0.02)
            time.sleep(delay)
            waited += delay

    def reconcile(self, reservation_id: int, actual_tokens: int) -> None:
        """Replace the estimate with provider-reported usage for following calls."""
        with self.lock:
            self.events = deque(
                (event_id, timestamp, max(1, int(actual_tokens)) if event_id == reservation_id else tokens)
                for event_id, timestamp, tokens in self.events
            )


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def get_api_key() -> str | None:
    """Read the key from the process environment or .env without printing it."""
    if os.environ.get("MARITACA_API_KEY"):
        return os.environ["MARITACA_API_KEY"].strip()
    env_path = ROOT / ".env"
    if not env_path.exists():
        return None
    for raw_line in env_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if separator and key.strip() == "MARITACA_API_KEY":
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            return value.strip() or None
    return None


def get_years(item: dict) -> set[int]:
    code = (item.get("codigo") or "").upper()
    faixa = str(item.get("ano_faixa") or "")
    range_match = re.search(r"(?<!\d)([1-9])\s*º?\s*(?:ao|a|até|[-–])\s*([1-9])\s*º?", faixa, re.I)
    if range_match:
        start, end = map(int, range_match.groups())
        if start <= end:
            return set(range(start, end + 1))
    explicit = {int(n) for n in re.findall(r"(?<!\d)([1-9])\s*º?", faixa)}
    if explicit:
        return explicit
    match = re.match(r"EF(\d{2})", code)
    if not match:
        return set()
    band = int(match.group(1))
    if band == 15:
        return set(range(1, 6))
    if band == 35:
        return set(range(3, 6))
    if band == 12:
        return {1, 2}
    if 1 <= band <= 9:
        return {band}
    return set()


def years_label(item: dict) -> str:
    return str(item.get("ano_faixa") or "faixa não informada").replace("\n", " ").strip()


def skill_line(item: dict) -> str:
    text = re.sub(r"\s+", " ", str(item.get("habilidade") or "")).strip()
    obj = re.sub(r"\s+", " ", str(item.get("objeto_conhecimento") or "")).strip()
    return (
        f"{item['codigo']} | {years_label(item)} | {item.get('unidade_tematica')} | "
        f"Objeto: {obj[:220] or 'não informado'} | Habilidade: {text[:450]}"
    )


def cosine_similarity(a: dict, b: dict) -> float:
    va = np.asarray(a.get("vetor") or [], dtype=np.float32)
    vb = np.asarray(b.get("vetor") or [], dtype=np.float32)
    if not va.size or va.size != vb.size:
        return 0.0
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    return float(np.dot(va, vb) / denom) if denom else 0.0


def eligible_candidates(target: dict, skills: list[dict]) -> list[dict]:
    target_years = get_years(target)
    if not target_years:
        return []
    buckets: dict[int, list[tuple[float, dict]]] = defaultdict(list)
    for candidate in skills:
        if candidate["codigo"] == target["codigo"]:
            continue
        candidate_years = get_years(candidate)
        if not candidate_years or min(candidate_years) > min(target_years):
            continue
        grade_bucket = min(max(candidate_years), max(target_years))
        buckets[grade_bucket].append((cosine_similarity(target, candidate), candidate))

    selected: dict[str, dict] = {}
    for grade in sorted(buckets):
        ranked = sorted(buckets[grade], key=lambda pair: (-pair[0], pair[1]["codigo"]))
        # Retain candidates from every thematic unit when available;
        # similarity narrows the review set but never creates a relation itself.
        for unit in UNITS:
            unit_items = [pair for pair in ranked if pair[1].get("unidade_tematica") == unit]
            for _, item in unit_items[:2]:
                selected[item["codigo"]] = item
        for _, item in ranked[:3]:
            selected[item["codigo"]] = item
    # Bound prompt size while preserving a spread across grade bands and units.
    if len(selected) > MAX_CANDIDATES_PER_TARGET:
        balanced = []
        grade_order = []
        grades = sorted(buckets)
        left, right = 0, len(grades) - 1
        while left <= right:
            grade_order.append(grades[right])
            right -= 1
            if left <= right:
                grade_order.append(grades[left])
                left += 1
        added_codes = set()
        for grade in grade_order:
            ranked = sorted(buckets[grade], key=lambda pair: (-pair[0], pair[1]["codigo"]))
            for unit in UNITS:
                candidate = next((item for _, item in ranked if item.get("unidade_tematica") == unit), None)
                if candidate and candidate["codigo"] not in added_codes:
                    balanced.append(candidate)
                    added_codes.add(candidate["codigo"])
                    if len(balanced) >= MAX_CANDIDATES_PER_TARGET:
                        break
            if len(balanced) >= MAX_CANDIDATES_PER_TARGET:
                break
        remaining = sorted(
            ((cosine_similarity(target, item), item) for item in selected.values() if item["codigo"] not in added_codes),
            key=lambda pair: (-pair[0], pair[1]["codigo"]),
        )
        balanced.extend(item for _, item in remaining[:max(0, MAX_CANDIDATES_PER_TARGET - len(balanced))])
        selected = {item["codigo"]: item for item in balanced[:MAX_CANDIDATES_PER_TARGET]}
    return sorted(selected.values(), key=lambda x: (min(get_years(x)), x["codigo"]))


def build_batches(skills: list[dict], batch_size: int) -> list[list[dict]]:
    ordered = sorted(
        skills,
        key=lambda x: (min(get_years(x) or {99}), x.get("unidade_tematica") or "", x["codigo"]),
    )
    return [ordered[index:index + batch_size] for index in range(0, len(ordered), batch_size)]


def prompt_for(targets: list[dict], candidate_map: dict[str, list[dict]]) -> str:
    all_candidates = {
        item["codigo"]: item
        for target in targets
        for item in candidate_map[target["codigo"]]
    }
    target_lines = "\n".join(f"- {skill_line(item)}" for item in targets)
    candidate_lines = "\n".join(f"- {skill_line(item)}" for item in all_candidates.values())
    allowed_pairs = [
        f"{source['codigo']} -> {target['codigo']}"
        for target in targets
        for source in candidate_map[target["codigo"]]
    ]
    return f"""Você é especialista em progressão curricular de Matemática na BNCC brasileira.

ESCOPO
Ensino Fundamental, 1º ao 9º ano, nas cinco unidades temáticas da BNCC: {', '.join(UNITS)}.
Uma habilidade de qualquer unidade pode se relacionar com outra unidade. A unidade
temática é um agrupador, não uma fronteira. A BNCC não declara pré-requisitos formais: toda
relação abaixo será uma inferência pedagógica sua, não um fato oficial.

HABILIDADES-ALVO DESTA ANÁLISE (só estas podem aparecer como destino):
{target_lines}

CANDIDATAS POSSÍVEIS PARA ORIGEM (use somente estes códigos):
{candidate_lines}

PARES PERMITIDOS (a candidata precisa estar associada ao alvo nesta lista):
{chr(10).join(allowed_pairs)}

TAREFA
Identifique relações defensáveis de progressão entre as habilidades. Analise o texto,
objeto de conhecimento, unidade temática e ano/faixa. Não use proximidade de códigos
como evidência, não imponha uma cadeia linear, não force elos e retorne uma lista vazia
quando não houver relação clara. Uma habilidade pode ter vários predecessores, convergir
com outras, ramificar ou não ter elo mapeável. Procure retomadas com complexidade,
abstração ou representação crescentes, inclusive atravessando unidades temáticas.

CLASSIFICAÇÃO (use exatamente um valor por relação)
- pre_requisito_direto: o conhecimento de origem é necessário para realizar o destino.
- retomada_espiral: o conceito reaparece no destino com ampliação/abstração/representação;
  explique o que aumenta, sem afirmar que é uma condição obrigatória.
- apoio: a origem pode ajudar, mas não é necessária para o destino.
- paralela: habilidades relacionadas no mesmo período/tema, sem dependência entre elas.

REGRAS
- Não invente, complete, corrija ou sugira códigos: use apenas pares permitidos acima.
- Para cada destino, retorne no máximo 4 relações e somente as que conseguir justificar.
- Não classifique uma relação paralela como pré-requisito.
- Justificativa de 1–2 frases, específica ao conteúdo dos textos fornecidos.
- Confiança: alta, media ou baixa. Prefira baixa ou omissão quando a conexão for incerta.
- Responda em português e somente com JSON válido no formato:
{{"relacoes":[{{"origem":"EF00MA00","destino":"EF00MA00","tipo":"pre_requisito_direto|retomada_espiral|apoio|paralela","justificativa":"...","confianca":"alta|media|baixa"}}]}}"""


def call_model(api_key: str, model: str, prompt: str, limiter: SlidingWindowRateLimiter) -> tuple[dict, dict, float]:
    if len(prompt) > MAX_PROMPT_CHARS:
        raise ValueError(f"Prompt excede o limite preventivo de {MAX_PROMPT_CHARS:,} caracteres.")
    # Deliberately overestimate tokens per character to leave headroom for
    # provider tokenization; provider usage replaces this estimate after success.
    estimated_input_tokens = math.ceil(len(prompt) * 2.0)
    reserved_tokens = estimated_input_tokens + MAX_OUTPUT_TOKENS
    waited, reservation_id = limiter.acquire(reserved_tokens)
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_tokens": MAX_OUTPUT_TOKENS,
    }
    if model.lower().startswith("s5"):
        body["reasoning_effort"] = "none"
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=180) as response:
        result = json.loads(response.read().decode("utf-8"))
    usage = result.get("usage") or {}
    actual_tokens = usage.get("total_tokens")
    if isinstance(actual_tokens, int) and actual_tokens > 0:
        limiter.reconcile(reservation_id, actual_tokens)
    content = (result.get("choices") or [{}])[0].get("message", {}).get("content") or ""
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
    return json.loads(content), usage, waited


def has_path(edges: list[dict], start: str, end: str) -> bool:
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        if edge["tipo"] in ("pre_requisito_direto", "retomada_espiral"):
            adjacency[edge["origem"]].append(edge["destino"])
    pending = [start]
    visited = set()
    while pending:
        current = pending.pop()
        if current == end:
            return True
        if current in visited:
            continue
        visited.add(current)
        pending.extend(adjacency[current])
    return False


def validate_relations(
    raw: dict,
    targets: list[dict],
    candidate_map: dict[str, list[dict]],
    by_code: dict[str, dict],
    existing: list[dict],
) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    target_codes = {item["codigo"] for item in targets}
    candidate_codes = {
        target_code: {item["codigo"] for item in candidates}
        for target_code, candidates in candidate_map.items()
    }
    clean: list[dict] = []
    seen = set()
    for relation in raw.get("relacoes") or []:
        if not isinstance(relation, dict):
            errors.append("relação ignorada: item não é objeto")
            continue
        source = str(relation.get("origem") or "").strip().upper()
        target = str(relation.get("destino") or "").strip().upper()
        kind = str(relation.get("tipo") or "").strip().lower()
        if source not in by_code or target not in by_code:
            errors.append(f"código inexistente: {source} -> {target}")
            continue
        if target not in target_codes or source not in candidate_codes.get(target, set()):
            errors.append(f"par fora das candidatas permitidas: {source} -> {target}")
            continue
        if source == target or kind not in RELATION_TYPES:
            errors.append(f"relação inválida: {source} -> {target} ({kind})")
            continue
        source_item, target_item = by_code[source], by_code[target]
        if source_item.get("disciplina") != "Matemática" or target_item.get("disciplina") != "Matemática":
            errors.append(f"relação fora de Matemática: {source} -> {target}")
            continue
        if source_item.get("unidade_tematica") not in UNITS or target_item.get("unidade_tematica") not in UNITS:
            errors.append(f"relação fora das unidades configuradas: {source} -> {target}")
            continue
        source_years, target_years = get_years(source_item), get_years(target_item)
        if kind == "paralela":
            if not source_years.intersection(target_years):
                errors.append(f"relação paralela sem faixa escolar comum: {source} -> {target}")
                continue
        elif source_years and target_years and min(source_years) > min(target_years):
            errors.append(f"origem posterior ao destino: {source} -> {target}")
            continue
        rationale = re.sub(r"\s+", " ", str(relation.get("justificativa") or "")).strip()
        if len(rationale) < 35:
            errors.append(f"justificativa curta: {source} -> {target}")
            continue
        confidence = str(relation.get("confianca") or "media").lower()
        if confidence not in ("alta", "media", "baixa"):
            confidence = "media"

        if kind == "paralela" and source > target:
            source, target = target, source
        key = (source, target)
        if key in seen:
            continue
        if kind in ("pre_requisito_direto", "retomada_espiral") and has_path(existing + clean, target, source):
            errors.append(f"ciclo rejeitado: {source} -> {target}")
            continue
        seen.add(key)
        clean.append({
            "origem": source,
            "destino": target,
            "tipo": kind,
            "justificativa": rationale,
            "confianca": confidence,
            "proveniencia": "inferência pedagógica gerada pela Maritaca; requer revisão docente",
        })
    return clean, errors


def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        try:
            return read_json(CHECKPOINT)
        except (OSError, json.JSONDecodeError):
            pass
    return {"batches": {}, "errors": {}}


def write_outputs(state: dict, skills: list[dict], batches: list[list[dict]], models_used: set[str]):
    batch_count = len(batches)
    done_count = len(state["batches"])
    unique_edges = {}
    confidence_priority = {"alta": 0, "media": 1, "baixa": 2}
    for batch_data in state["batches"].values():
        for edge in batch_data.get("relacoes", []):
            if edge["tipo"] == "paralela":
                pair = tuple(sorted((edge["origem"], edge["destino"])))
                key = ("paralela", *pair)
            else:
                key = (edge["tipo"], edge["origem"], edge["destino"])
            previous = unique_edges.get(key)
            if previous is None or confidence_priority.get(edge.get("confianca"), 9) < confidence_priority.get(previous.get("confianca"), 9):
                unique_edges[key] = edge
    edges = list(unique_edges.values())
    edges.sort(key=lambda r: (
        min(get_years(next(s for s in skills if s["codigo"] == r["destino"])) or {99}),
        r["destino"], RELATION_PRIORITY[r["tipo"]], r["origem"],
    ))
    meta = {
        "versao": "1.0",
        "provedor": "Maritaca AI",
        "modelos": sorted(models_used),
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "componente": "Matemática",
        "etapa": "Ensino Fundamental",
        "unidades_tematicas": list(UNITS),
        "fonte_habilidades": "bncc_vetores.json",
        "metodo": "Relações sugeridas pela IA a partir dos textos BNCC nas cinco unidades temáticas, validadas contra os códigos e faixas escolares da base. Não foram copiadas relações do Reúna.",
        "aviso": "As relações são inferências pedagógicas geradas por IA; não são pré-requisitos oficiais declarados pela BNCC e precisam de revisão docente.",
        "total_habilidades": len(skills),
        "total_relacoes": len(edges),
        "lotes_concluidos": done_count,
        "lotes_total": batch_count,
        "lotes_com_erro": len(state.get("errors", {})),
    }
    output = {
        "meta": meta,
        "habilidades": [item["codigo"] for item in skills],
        "relacoes": edges,
    }
    write_json_atomic(OUTPUT, output)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="valida escopo e estima lotes sem chamar a API")
    parser.add_argument("--limit-batches", type=int, default=0, help="processa no máximo N lotes nesta execução")
    parser.add_argument("--batch-size", type=int, default=5, help="habilidades-alvo por chamada (padrão: 5)")
    parser.add_argument("--rpm", type=int, default=MAX_RPM, help="teto local de RPM (máximo permitido: 60)")
    parser.add_argument("--tpm", type=int, default=MAX_TPM, help="teto local de TPM (máximo permitido: 256000)")
    parser.add_argument("--force", action="store_true", help="limpa o checkpoint e recomeça a geração")
    args = parser.parse_args()

    base = read_json(BASE_FILE)
    by_code = {item["codigo"].upper(): item for item in base if item.get("codigo")}
    skills = [
        item for item in base
        if item.get("disciplina") == "Matemática"
        and item.get("codigo", "").upper().startswith("EF")
        and item.get("unidade_tematica") in UNITS
        and get_years(item)
    ]
    skills.sort(key=lambda x: (min(get_years(x)), x.get("unidade_tematica") or "", x["codigo"]))
    batches = build_batches(skills, max(1, args.batch_size))
    candidate_maps = {
        item["codigo"]: eligible_candidates(item, skills)
        for item in skills
    }
    print(f"Escopo BNCC: {len(skills)} habilidades de Matemática | {', '.join(UNITS)}")
    print(f"Lotes estimados: {len(batches)} | tamanho do lote: {max(1, args.batch_size)}")
    print(f"Modelo: somente {MODELS[0]} | limites controlados: até {min(MAX_RPM, max(1, args.rpm))} RPM / {min(MAX_TPM, max(1, args.tpm)):,} TPM")
    print("Critérios: códigos existentes, candidatos sem habilidades de anos posteriores, relações não forçadas.")
    if args.dry_run:
        sizes = [len({x["codigo"] for target in batch for x in candidate_maps[target["codigo"]]}) for batch in batches]
        prompt_lengths = [len(prompt_for(batch, {item["codigo"]: candidate_maps[item["codigo"]] for item in batch})) for batch in batches]
        print(f"Candidatas únicas por lote: min={min(sizes)}, max={max(sizes)}, média={sum(sizes) / max(1, len(sizes)):.1f}")
        print(f"Maior prompt: {max(prompt_lengths):,} caracteres | teto preventivo: {MAX_PROMPT_CHARS:,}")
        print("Dry-run: nenhuma chamada Maritaca feita e nenhum arquivo de saída alterado.")
        return

    api_key = get_api_key()
    if not api_key:
        raise SystemExit("MARITACA_API_KEY não encontrada no ambiente ou no .env do projeto.")
    limiter = SlidingWindowRateLimiter(args.rpm, args.tpm)
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    state = {"batches": {}, "errors": {}} if args.force else load_checkpoint()
    models_used = {
        batch.get("modelo") for batch in state["batches"].values() if batch.get("modelo")
    }
    if args.force:
        write_json_atomic(CHECKPOINT, state)
        write_outputs(state, skills, batches, models_used)
    pending = [
        (index, batch) for index, batch in enumerate(batches)
        if f"lote_{index:03d}" not in state["batches"]
    ]
    if args.limit_batches:
        pending = pending[:max(0, args.limit_batches)]
    print(f"Lotes já concluídos: {len(state['batches'])}/{len(batches)} | pendentes nesta execução: {len(pending)}")

    for index, targets in pending:
        batch_id = f"lote_{index:03d}"
        candidate_map = {item["codigo"]: candidate_maps[item["codigo"]] for item in targets}
        prompt = prompt_for(targets, candidate_map)
        failure_messages = []
        generated = None
        used_model = None
        for model in MODELS:
            for attempt in range(2):
                try:
                    response, usage, waited = call_model(api_key, model, prompt, limiter)
                    clean, validation_errors = validate_relations(response, targets, candidate_map, by_code, [
                        edge for previous in state["batches"].values() for edge in previous.get("relacoes", [])
                    ])
                    generated = clean
                    used_model = model
                    if waited >= 1:
                        print(f"{batch_id}: aguardou {waited:.1f}s pelo limite da API.")
                    if validation_errors:
                        print(f"{batch_id}: {len(validation_errors)} sugestão(ões) inválida(s) descartada(s).")
                    break
                except urllib.error.HTTPError as exc:
                    body = exc.read().decode("utf-8", "ignore")[:350]
                    failure_messages.append(f"{model} HTTP {exc.code}: {body}")
                    if exc.code not in (408, 409, 429, 500, 502, 503, 504):
                        break
                    retry_after = exc.headers.get("Retry-After") if exc.headers else None
                    try:
                        delay = float(retry_after) if retry_after else min(8 * (2 ** attempt), 45)
                    except (TypeError, ValueError):
                        delay = min(8 * (2 ** attempt), 45)
                    time.sleep(min(delay + random.random(), 60))
                except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError) as exc:
                    failure_messages.append(f"{model}: {type(exc).__name__}: {str(exc)[:250]}")
                    if attempt == 0:
                        time.sleep(2 + random.random())
            if generated is not None:
                break
        if generated is None:
            state["errors"][batch_id] = {"alvos": [x["codigo"] for x in targets], "tentativas": failure_messages}
            print(f"{batch_id}: falha após tentativas; o lote será retomado na próxima execução.")
            write_json_atomic(CHECKPOINT, state)
            continue

        models_used.add(used_model)
        state["batches"][batch_id] = {
            "alvos": [x["codigo"] for x in targets],
            "modelo": used_model,
            "tokens_api": usage,
            "relacoes": generated,
        }
        state["errors"].pop(batch_id, None)
        write_json_atomic(CHECKPOINT, state)
        write_outputs(state, skills, batches, models_used)
        actual_tokens = usage.get("total_tokens")
        usage_label = f" | {actual_tokens:,} tokens informados" if isinstance(actual_tokens, int) else ""
        print(f"[{len(state['batches'])}/{len(batches)}] {batch_id}: {len(generated)} relação(ões) aceitas | {used_model}{usage_label}", flush=True)

    write_outputs(state, skills, batches, models_used)
    if len(state["batches"]) < len(batches):
        print("Geração parcial salva; execute novamente o mesmo comando para retomar os lotes pendentes.")
    print(f"Saída: {OUTPUT.name} | relações validadas: {sum(len(x.get('relacoes', [])) for x in state['batches'].values())}")


if __name__ == "__main__":
    main()
