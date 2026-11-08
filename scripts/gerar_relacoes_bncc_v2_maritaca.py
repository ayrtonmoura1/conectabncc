#!/usr/bin/env python3
"""Generate the experimental, resumable BNCC Relations 2 JSON using Sabiazinho 4.

Official records are assembled from bncc_vetores.json. The model may only suggest
thread assignments and pedagogical edges between codes explicitly supplied to it.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import json
import math
import os
import random
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

from relacoes_bncc_v2 import (
    CONFIDENCE,
    FOUNDATIONS,
    RELATION_TYPES,
    STAGE_PRIORITY,
    atomic_write_json,
    expected_scope,
    normalized_component,
    prepare_document,
    read_json,
    sha256_file,
    source_precedes,
    stage_for,
    validate_supplemental_metadata,
    years_for,
)


ROOT = Path(__file__).resolve().parents[1]
BASE_FILE = ROOT / "bncc_vetores.json"
METADATA_FILE = ROOT / "relacoes_bncc_final.json"
OUTPUT_FILE = ROOT / "relacoes_bncc_v2_progressao.json"
STATE_DIR = ROOT / "relacoes_bncc_v2_fios_progressao"
USAGE_FILE = ROOT / "relacoes_bncc_v2" / "_usage_sabiazinho4.json"
API_URL = "https://chat.maritaca.ai/api/chat/completions"
MODEL = "sabiazinho-4"
FREE_MODEL = "S5-free"
PROMPT_VERSION = "bncc-relacoes-v2.3-progressao-temporal"
DEFAULT_RPM = 12
DEFAULT_TPM = 64_000
DEFAULT_DAILY_REQUESTS = 500
DEFAULT_DAILY_TOKENS = 5_000_000
DEFAULT_MAX_COST_BRL = 20.0
MODEL_INPUT_BRL_PER_MILLION = 1.0
MODEL_OUTPUT_BRL_PER_MILLION = 4.0
DEFAULT_MAX_PROMPT_CHARS = 22_000
DEFAULT_MAX_OUTPUT_TOKENS = 6_000
MAX_RELATIONS_PER_TARGET = 4
_free_quota_exhausted = False


class QuotaLimitReached(RuntimeError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def get_api_key() -> str | None:
    """Read the environment first, then .env; never print or persist the key."""
    value = os.environ.get("MARITACA_API_KEY", "").strip()
    if value:
        return value
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return None
    try:
        return parse_env_value(env_file.read_text(encoding="utf-8-sig"), "MARITACA_API_KEY")
    except OSError:
        return None


def parse_env_value(text: str, variable: str) -> str | None:
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        name, separator, candidate = line.partition("=")
        if not separator or name.strip() != variable:
            continue
        candidate = candidate.strip()
        if len(candidate) >= 2 and candidate[0] == candidate[-1] and candidate[0] in {"'", '"'}:
            candidate = candidate[1:-1]
        return candidate.strip() or None
    return None


def cosine_similarity(left: dict, right: dict) -> float:
    a, b = left.get("vetor") or [], right.get("vetor") or []
    if not isinstance(a, list) or not isinstance(b, list) or not a or len(a) != len(b):
        return 0.0
    dot = sum(float(x) * float(y) for x, y in zip(a, b))
    norm_a = math.sqrt(sum(float(x) ** 2 for x in a))
    norm_b = math.sqrt(sum(float(y) ** 2 for y in b))
    return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0


def pairwise_similarity_map(base: list[dict]) -> tuple[dict[str, int], np.ndarray]:
    """Calculate embedding similarities once with vectorized linear algebra."""
    codes = [str(item.get("codigo") or "") for item in base]
    vectors = [item.get("vetor") or [] for item in base]
    dimensions = max((len(vector) for vector in vectors if isinstance(vector, list)), default=0)
    if dimensions == 0:
        return {code: index for index, code in enumerate(codes)}, np.zeros((len(base), len(base)), dtype=np.float32)
    matrix = np.zeros((len(base), dimensions), dtype=np.float32)
    for index, vector in enumerate(vectors):
        if isinstance(vector, list) and len(vector) == dimensions:
            matrix[index] = np.asarray(vector, dtype=np.float32)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    normalized = np.divide(matrix, norms, out=np.zeros_like(matrix), where=norms != 0)
    similarities = normalized @ normalized.T
    return {code: index for index, code in enumerate(codes)}, similarities


def _temporal_overlap(left: dict, right: dict) -> bool:
    if stage_for(left) != stage_for(right):
        return False
    left_years, right_years = set(years_for(left)), set(years_for(right))
    return not left_years or not right_years or bool(left_years.intersection(right_years))


def _temporal_position(source: dict, target: dict) -> str:
    """Compare curricular recortes across stages and overlapping year ranges."""
    source_stage, target_stage = stage_for(source), stage_for(target)
    if not source_stage or not target_stage:
        return "indeterminado"
    source_rank = STAGE_PRIORITY.get(source_stage, 99)
    target_rank = STAGE_PRIORITY.get(target_stage, 99)
    if source_rank < target_rank:
        return "anterior"
    if source_rank > target_rank:
        return "posterior"
    source_years, target_years = years_for(source), years_for(target)
    if not source_years or not target_years:
        return "mesma_fase"
    if max(source_years) < min(target_years):
        return "anterior"
    if min(source_years) > max(target_years):
        return "posterior"
    return "mesma_fase"


def candidate_sources(
    target: dict,
    base: list[dict],
    max_candidates: int,
    similarities: tuple[dict[str, int], np.ndarray] | None = None,
) -> list[dict]:
    """Reserve context for same-component predecessors and cross-component recortes."""
    buckets: dict[str, list[tuple[float, dict]]] = {
        "componente_anterior": [],
        "componente_mesma_fase": [],
        "interdisciplinar_mesma_fase": [],
        "interdisciplinar_anterior": [],
    }
    target_component = normalized_component(target)
    for candidate in base:
        if candidate.get("codigo") == target.get("codigo") or not source_precedes(candidate, target):
            continue
        position = _temporal_position(candidate, target)
        if position in {"posterior", "indeterminado"}:
            continue
        same_component = normalized_component(candidate) == target_component
        if same_component:
            bucket = "componente_anterior" if position == "anterior" else "componente_mesma_fase"
        else:
            bucket = "interdisciplinar_mesma_fase" if position == "mesma_fase" else "interdisciplinar_anterior"
        if similarities:
            index_by_code, matrix = similarities
            source_index = index_by_code.get(target.get("codigo"))
            candidate_index = index_by_code.get(candidate.get("codigo"))
            score = float(matrix[source_index, candidate_index]) if source_index is not None and candidate_index is not None else 0.0
        else:
            score = cosine_similarity(target, candidate)
        buckets[bucket].append((score, candidate))

    def diversify(rows: list[tuple[float, dict]], limit: int) -> list[dict]:
        by_component: dict[str, list[tuple[float, dict]]] = defaultdict(list)
        for row in rows:
            by_component[normalized_component(row[1])].append(row)
        for values in by_component.values():
            values.sort(key=lambda row: (-row[0], row[1].get("codigo", "")))
        ordered_components = sorted(
            by_component,
            key=lambda component: (-by_component[component][0][0], component.casefold()),
        )
        selected: list[dict] = []
        position = 0
        while len(selected) < limit:
            added = False
            for component in ordered_components:
                choices = by_component[component]
                if position < len(choices):
                    selected.append(choices[position][1])
                    added = True
                    if len(selected) >= limit:
                        break
            if not added:
                break
            position += 1
        return selected

    previous_cap = max(1, max_candidates * 3 // 8)
    same_component_cap = max_candidates // 8
    same_phase_inter_cap = max_candidates // 4
    previous_inter_cap = max(0, max_candidates - previous_cap - same_component_cap - same_phase_inter_cap)
    capacities = {
        "componente_anterior": previous_cap,
        "interdisciplinar_mesma_fase": same_phase_inter_cap,
        "interdisciplinar_anterior": previous_inter_cap,
        "componente_mesma_fase": same_component_cap,
    }
    bucket_order = list(capacities)
    selected: list[dict] = []
    selected_codes: set[str] = set()
    for bucket in bucket_order:
        for candidate in diversify(buckets[bucket], capacities[bucket]):
            if candidate["codigo"] not in selected_codes:
                selected.append(candidate)
                selected_codes.add(candidate["codigo"])

    # Spill unused quota across the same ordered groups, retaining diversity.
    for bucket in bucket_order:
        remaining = [row for row in buckets[bucket] if row[1]["codigo"] not in selected_codes]
        for candidate in diversify(remaining, max_candidates - len(selected)):
            if candidate["codigo"] not in selected_codes:
                selected.append(candidate)
                selected_codes.add(candidate["codigo"])
            if len(selected) >= max_candidates:
                break
        if len(selected) >= max_candidates:
            break
    return selected


def ordered_targets(base: list[dict]) -> list[dict]:
    return sorted(
        base,
        key=lambda item: (
            STAGE_PRIORITY.get(stage_for(item), 9),
            min(years_for(item) or [99]),
            normalized_component(item),
            item.get("codigo", ""),
        ),
    )


def build_batches(
    base: list[dict],
    candidate_map: dict[str, list[dict]],
    batch_size: int,
    max_prompt_chars: int,
    supplemental_by_code: dict[str, dict] | None = None,
) -> list[list[dict]]:
    """Greedily group nearby targets while keeping each prompt below a hard cap."""
    supplemental_by_code = supplemental_by_code or {}
    batches: list[list[dict]] = []
    current: list[dict] = []

    def fit_single(item: dict) -> None:
        candidates = candidate_map[item["codigo"]]
        while len(prompt_for([item], candidate_map, [], supplemental_by_code)) > max_prompt_chars and candidates:
            candidates.pop()
        prompt_length = len(prompt_for([item], candidate_map, [], supplemental_by_code))
        if prompt_length > max_prompt_chars:
            raise ValueError(
                f"Prompt unitário mínimo para {item['codigo']} ({prompt_length} caracteres) excede o limite efetivo de {max_prompt_chars}; reduza o texto de contexto ou aumente o orçamento TPM local."
            )

    for item in ordered_targets(base):
        if not current:
            fit_single(item)
        proposed = current + [item]
        prompt = prompt_for(proposed, candidate_map, [], supplemental_by_code)
        if current and (len(proposed) > batch_size or len(prompt) > max_prompt_chars):
            batches.append(current)
            current = [item]
            fit_single(item)
        else:
            current = proposed
    if current:
        batches.append(current)
    return batches


def _prompt_excerpt(value: Any, maximum: int) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    return text if len(text) <= maximum else text[:maximum - 1].rstrip() + "…"


def _item_for_prompt(item: dict, supplemental_by_code: dict[str, dict], is_target: bool) -> dict:
    supplemental = supplemental_by_code.get(str(item.get("codigo") or ""), {})
    object_values = supplemental.get("objetos_conhecimento") or []
    if not is_target:
        object_values = [_prompt_excerpt(value, 180) for value in object_values[:4]]
    return {
        "codigo": item.get("codigo"),
        "etapa": stage_for(item),
        "componente": normalized_component(item),
        "anoOuFaixa": item.get("ano_faixa") or "não informado",
        "unidadeTematica": item.get("unidade_tematica") or None,
        "objetoConhecimento": _prompt_excerpt(item.get("objeto_conhecimento"), 700 if is_target else 280),
        "objetosConhecimentoComplementares": object_values,
        "textoOficial": _prompt_excerpt(item.get("habilidade"), 5_000 if is_target else 900),
    }


def prompt_for(
    targets: list[dict],
    candidate_map: dict[str, list[dict]],
    existing_wires: list[dict],
    supplemental_by_code: dict[str, dict] | None = None,
) -> str:
    supplemental_by_code = supplemental_by_code or {}
    candidate_codes = sorted({
        candidate["codigo"]
        for target in targets
        for candidate in candidate_map.get(target["codigo"], [])
    })
    by_code = {
        item["codigo"]: item
        for item in [*targets, *[candidate for target in targets for candidate in candidate_map.get(target["codigo"], [])]]
    }
    allowed_pairs = sorted({
        (candidate["codigo"], target["codigo"])
        for target in targets
        for candidate in candidate_map.get(target["codigo"], [])
    })
    wires = [
        {
            "nome": wire.get("nome"),
            "resumo": wire.get("resumo"),
            "componentes": wire.get("componentes", []),
            "itensVinculados": wire.get("itensVinculados", 0),
        }
        for wire in existing_wires[:18]
    ]
    payload = {
        "alvos": [_item_for_prompt(item, supplemental_by_code, True) for item in targets],
        "candidatasOrigem": [_item_for_prompt(by_code[code], supplemental_by_code, False) for code in candidate_codes],
        "paresPermitidos_de_para": [[source, target] for source, target in allowed_pairs],
        "fiosJaConsolidados": wires,
    }
    return f"""Você é especialista em currículo da Educação Básica brasileira e engenharia de dados educacionais. Trabalhe exclusivamente com os itens e textos desta solicitação, extraídos da matriz BNCC local. As relações sugeridas são inferências pedagógicas, não pré-requisitos oficiais, salvo evidência textual explícita.

ESCOPO DESTA RODADA
BNCC disponível na matriz local, com EI, EF e EM. Cada código é um item real. A faixa etária/ano é metadado; código numérico próximo não é evidência de progressão.

DADOS E PARES PERMITIDOS
{json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}

TAREFA
1. Primeiro compare os alvos ENTRE SI como um conjunto e identifique trajetórias de aprendizagem compartilhadas. O fio representa uma trajetória conceitual que pode reunir vários objetivos relacionados; não é um rótulo individual para cada código, verbo ou atividade. Quando dois ou mais alvos tiverem um núcleo de aprendizagem contínuo, atribua-lhes exatamente o mesmo nome e resumo de fio, mesmo que não haja aresta direta entre todos. Evite criar um fio exclusivo para cada alvo ou separar objetivos só porque usam verbos/atividades diferentes. Crie fios distintos quando os núcleos de aprendizagem forem realmente diferentes; semelhança de etapa, componente ou unidade é uma pista, não motivo suficiente para agrupar automaticamente.
2. Reutilize exatamente um fio consolidado do catálogo quando o conceito e o resumo forem compatíveis. O campo itensVinculados informa quantos registros já usam aquele fio: não reutilize vários rótulos unitários como se fossem trajetórias distintas quando os alvos atuais compartilham um núcleo mais amplo. Se não houver fio consolidado adequado, proponha nome curto que sintetize o conceito compartilhado, não apenas a atividade de um alvo.
3. Sugira fase de desenvolvimento de 1 a 5 e explique em uma frase por que a progressão não é determinada pelo vizinho numérico; mencione o antecessor real somente quando houver relação defensável.
4. Para cada alvo, investigue explicitamente três frentes usando os anos/faixas e os textos: (a) habilidades anteriores do mesmo componente, inclusive de anos/fases anteriores; (b) habilidades interdisciplinares do mesmo ano/fase; (c) habilidades interdisciplinares de fases anteriores. O conjunto completo será consultado nos dois sentidos, então uma relação de hoje com um alvo posterior aparecerá como posterior na habilidade de hoje quando esse outro alvo for analisado.
5. Quando houver no conjunto de candidatas uma habilidade anterior do mesmo componente com contribuição pedagógica defensável, registre a melhor relação direta para o alvo. Não deixe de relacionar só porque não é pré-requisito obrigatório: use retomada para ampliação/reaparição e apoio para contribuição útil, mas não necessária. Priorize essa relação de progressão no componente; complete com relações interdisciplinares realmente relevantes, até o limite de 4 arestas de entrada por alvo. Se não houver candidata anterior pertinente ou o texto não sustentar nenhum vínculo, não fabrique uma relação: explique brevemente a ausência na explicação do alvo.
6. Para relações interdisciplinares, avalie separadamente recortes sobrepostos (mesmo ano/fase) e anteriores. Não exija que tenham a mesma etapa administrativa para conectar EI→EF ou EF→EM quando os textos indicarem continuidade. A fase/ano e o componente serão usados pela interface para apresentar a relação como anterior, no mesmo ano/fase ou posterior; não classifique a relação como “horizontal” ou “vertical”.
7. Sugira arestas somente a partir dos pares permitidos. Use a direção de = base/anterior; para = item dependente/posterior. Não invente códigos, não infira relação pela ordem da tabela/código, evite redundância transitiva e não conecte por mera semelhança lexical.
8. Para cada alvo, no máximo 4 arestas de entrada. Não force volume ou conexões só por vizinhança; prefira uma justificativa específica e pedagogicamente útil a uma lista extensa.

TIPOS EXATOS: prerequisito, retomada, apoio, paralela.
- prerequisito: ferramenta direta necessária para o destino.
- retomada: destino retoma/amplia a origem.
- apoio: origem ajuda o destino, sem obrigatoriedade.
- paralela: conexão temática sem dependência; somente entre itens do mesmo ano/fase sobreposto. A direção será normalizada pelo sistema e não significa precedência.

FUNDAMENTO EXATO: explicito_na_bncc ou inferencia_pedagogica. Use explicito_na_bncc apenas se os textos fornecidos expressarem explicitamente a relação; na dúvida, inferencia_pedagogica.
CONFIANÇA EXATA: alta, media ou baixa. Justificativa específica em uma frase, baseada nos textos. Não cite conhecimento externo como se estivesse na matriz.

Retorne somente JSON válido, sem Markdown, neste formato:
{{"itens":[{{"codigo":"CODIGO_ALVO","fio":{{"nome":"Nome curto","resumo":"Resumo do fio"}},"faseSugerida":1,"explicacao":"Uma frase."}}],"arestas":[{{"de":"CODIGO_ORIGEM","para":"CODIGO_ALVO","tipo":"prerequisito|retomada|apoio|paralela","fundamento":"inferencia_pedagogica","confianca":"alta|media|baixa","justificativa":"Uma frase específica."}}]}}
Devolva exatamente um item de progressão para cada código de alvos. As únicas arestas válidas usam exatamente os pares permitidos listados acima."""


class PersistentQuotaGuard:
    """Local rolling-window and UTC-day budgets; external account usage is unknowable."""

    def __init__(
        self,
        path: Path,
        rpm: int,
        tpm: int,
        daily_requests: int,
        daily_tokens: int,
        max_total_cost_brl: float | None = None,
    ):
        self.path = path
        self.rpm = max(1, rpm)
        self.tpm = max(1, tpm)
        self.daily_requests = max(1, daily_requests)
        self.daily_tokens = max(1, daily_tokens)
        self.max_total_cost_brl = max_total_cost_brl

    def _load(self) -> dict:
        if not self.path.exists():
            return {"version": 1, "requests": [], "custoTotalReservadoBRL": 0.0}
        try:
            data = read_json(self.path)
            if isinstance(data, dict) and isinstance(data.get("requests"), list):
                return data
        except (OSError, json.JSONDecodeError):
            pass
        raise RuntimeError(f"Arquivo de cota local inválido: {self.path}; preserve-o e investigue antes de continuar.")

    def _save(self, data: dict) -> None:
        cutoff = utc_now().timestamp() - 8 * 24 * 60 * 60
        data["requests"] = [entry for entry in data["requests"] if float(entry.get("timestamp", 0)) >= cutoff]
        atomic_write_json(self.path, data)

    def reserve(self, estimated_tokens: int, estimated_cost_brl: float = 0.0) -> tuple[str, float]:
        estimated_tokens = max(1, int(estimated_tokens))
        estimated_cost_brl = max(0.0, float(estimated_cost_brl))
        if estimated_tokens > self.tpm:
            raise QuotaLimitReached(f"Uma chamada estima {estimated_tokens} tokens, acima do limite TPM local de {self.tpm}.")
        while True:
            data = self._load()
            now = utc_now()
            now_ts = now.timestamp()
            day = now.date().isoformat()
            today = [entry for entry in data["requests"] if entry.get("diaUTC") == day]
            if len(today) >= self.daily_requests:
                raise QuotaLimitReached(f"Limite local de {self.daily_requests} chamadas/dia atingido; retome após a virada UTC ou ajuste a cota após confirmar a conta.")
            used_daily = sum(int(entry.get("tokens", 0)) for entry in today)
            if used_daily + estimated_tokens > self.daily_tokens:
                raise QuotaLimitReached(f"Limite local de {self.daily_tokens} tokens/dia seria excedido; retome após a virada UTC.")
            current_cost = float(data.get("custoTotalReservadoBRL", 0.0))
            if self.max_total_cost_brl is not None and current_cost + estimated_cost_brl > self.max_total_cost_brl:
                raise QuotaLimitReached(
                    f"Limite acumulado local de custo R$ {self.max_total_cost_brl:.2f} seria excedido; chamadas pagas pausadas."
                )
            window = [entry for entry in data["requests"] if now_ts - float(entry.get("timestamp", 0)) < 60]
            window_tokens = sum(int(entry.get("tokens", 0)) for entry in window)
            if len(window) < self.rpm and window_tokens + estimated_tokens <= self.tpm:
                request_id = hashlib.sha256(f"{now_ts}:{os.getpid()}:{len(data['requests'])}".encode()).hexdigest()[:16]
                data["requests"].append({
                    "id": request_id,
                    "timestamp": now_ts,
                    "diaUTC": day,
                    "tokens": estimated_tokens,
                    "status": "reservado",
                    "custoReservadoBRL": estimated_cost_brl,
                })
                data["custoTotalReservadoBRL"] = round(current_cost + estimated_cost_brl, 8)
                self._save(data)
                return request_id, 0.0
            oldest = min(window, key=lambda entry: float(entry.get("timestamp", 0)))
            delay = max(0.2, 60 - (now_ts - float(oldest["timestamp"])) + 0.1)
            time.sleep(delay)

    def reconcile(
        self,
        request_id: str,
        actual_tokens: int | None,
        status: str,
        actual_cost_brl: float | None = None,
    ) -> None:
        data = self._load()
        for entry in reversed(data["requests"]):
            if entry.get("id") == request_id:
                if isinstance(actual_tokens, int) and actual_tokens > 0:
                    entry["tokens"] = actual_tokens
                if isinstance(actual_cost_brl, (int, float)) and actual_cost_brl >= 0:
                    reserved_cost = float(entry.get("custoReservadoBRL", 0.0))
                    data["custoTotalReservadoBRL"] = round(
                        max(0.0, float(data.get("custoTotalReservadoBRL", 0.0)) + float(actual_cost_brl) - reserved_cost),
                        8,
                    )
                    entry["custoReservadoBRL"] = round(float(actual_cost_brl), 8)
                    entry["custoRealBRL"] = round(float(actual_cost_brl), 8)
                entry["status"] = status
                break
        self._save(data)

    def total_cost_reserved_brl(self) -> float:
        return float(self._load().get("custoTotalReservadoBRL", 0.0))


def _parse_json_response(result: dict) -> dict:
    choices = result.get("choices") or []
    content = ((choices[0].get("message") or {}).get("content") if choices else "") or ""
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        raise ValueError("A resposta da Maritaca não é um objeto JSON.")
    return parsed


def _safe_http_error_summary(error: urllib.error.HTTPError, api_key: str) -> str:
    """Return a short server diagnostic without retaining a credential or full body."""
    try:
        raw = error.read(4096).decode("utf-8", errors="replace")
    except OSError:
        raw = ""
    finally:
        error.close()
    detail = ""
    try:
        payload = json.loads(raw) if raw else {}
        error_data = payload.get("error") if isinstance(payload, dict) else None
        if isinstance(error_data, dict):
            detail = str(error_data.get("message") or error_data.get("detail") or error_data.get("code") or "")
        elif isinstance(error_data, str):
            detail = error_data
        elif isinstance(payload, dict):
            detail = str(payload.get("message") or payload.get("detail") or "")
    except (json.JSONDecodeError, TypeError, ValueError):
        detail = re.sub(r"\s+", " ", raw).strip()
    detail = re.sub(r"\s+", " ", detail).strip()
    if api_key:
        detail = detail.replace(api_key, "[redacted]")
    detail = re.sub(r"(?i)bearer\s+\S+", "Bearer [redacted]", detail)
    detail = detail[:240]
    return f"HTTP {error.code}" + (f": {detail}" if detail else "")


def build_request_body(model: str, prompt: str, max_output_tokens: int) -> dict:
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_tokens": max_output_tokens,
    }
    if model.casefold().startswith("s5"):
        body["reasoning_effort"] = "none"
    return body


def call_model(api_key: str, prompt: str, quota: PersistentQuotaGuard, max_output_tokens: int, max_attempts: int = 3, *, model: str = MODEL) -> tuple[dict, dict]:
    if not api_key:
        raise RuntimeError("MARITACA_API_KEY não está configurada no ambiente do processo.")
    estimated_tokens = math.ceil(len(prompt) * 0.70) + max_output_tokens
    # Reserve 1.5 input tokens per prompt character plus the full output cap;
    # this is intentionally more conservative than the RPM/TPM estimate.
    estimated_cost_brl = (
        len(prompt) * 1.5 * MODEL_INPUT_BRL_PER_MILLION
        + max_output_tokens * MODEL_OUTPUT_BRL_PER_MILLION
    ) / 1_000_000
    if model == FREE_MODEL:
        estimated_cost_brl = 0.0
    errors = []
    for attempt in range(max_attempts):
        request_id, _waited = quota.reserve(estimated_tokens, estimated_cost_brl)
        body = build_request_body(model, prompt, max_output_tokens)
        request = urllib.request.Request(
            API_URL,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                result = json.loads(response.read().decode("utf-8"))
            parsed = _parse_json_response(result)
            usage = result.get("usage") or {}
            actual = usage.get("total_tokens")
            input_tokens = usage.get("prompt_tokens")
            output_tokens = usage.get("completion_tokens")
            actual_cost = None
            if model != FREE_MODEL and isinstance(input_tokens, int) and isinstance(output_tokens, int):
                actual_cost = (
                    input_tokens * MODEL_INPUT_BRL_PER_MILLION
                    + output_tokens * MODEL_OUTPUT_BRL_PER_MILLION
                ) / 1_000_000
            quota.reconcile(
                request_id,
                actual if isinstance(actual, int) else None,
                "concluido",
                actual_cost,
            )
            return parsed, usage
        except urllib.error.HTTPError as exc:
            quota.reconcile(request_id, None, f"http_{exc.code}")
            errors.append(_safe_http_error_summary(exc, api_key))
            if model == FREE_MODEL and exc.code == 429:
                raise QuotaLimitReached("S5-free atingiu limite de requisições ou cota (HTTP 429).") from None
            if exc.code not in {408, 409, 429, 500, 502, 503, 504} or attempt + 1 >= max_attempts:
                break
            retry_after = (exc.headers or {}).get("Retry-After")
            try:
                delay = max(1.0, float(retry_after)) if retry_after else min(15 * (2 ** attempt), 90)
            except (TypeError, ValueError):
                delay = min(15 * (2 ** attempt), 90)
            # A prolonged 429 is treated as a stop signal; the batch remains resumable.
            if exc.code == 429 and delay > 120:
                raise RuntimeError("Maritaca respondeu 429 com espera acima de 120s; lote preservado para retomada.") from None
            time.sleep(min(delay + random.random(), 120))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
            quota.reconcile(request_id, None, "resposta_invalida_ou_rede")
            errors.append(type(exc).__name__)
            if attempt + 1 >= max_attempts:
                break
            time.sleep(min(3 * (2 ** attempt), 30) + random.random())
    raise RuntimeError("Falha na chamada Maritaca: " + ", ".join(errors or ["erro desconhecido"]))


def call_model_with_fallback(api_key: str, prompt: str, free_quota: PersistentQuotaGuard, paid_quota: PersistentQuotaGuard, max_output_tokens: int, max_attempts: int = 3) -> tuple[dict, dict, str]:
    global _free_quota_exhausted
    if not _free_quota_exhausted:
        try:
            response, usage = call_model(api_key, prompt, free_quota, max_output_tokens, max_attempts, model=FREE_MODEL)
            return response, usage, FREE_MODEL
        except QuotaLimitReached as exc:
            _free_quota_exhausted = True
            print(f"S5-free indisponível por limite ({exc}); usando Sabiazinho 4 dentro do teto pago nesta execução.", flush=True)
    response, usage = call_model(api_key, prompt, paid_quota, max_output_tokens, max_attempts, model=MODEL)
    return response, usage, MODEL


def _path_exists(edges: list[dict], start: str, end: str) -> bool:
    adjacency: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        adjacency[edge["de"]].append(edge["para"])
    stack, visited = [start], set()
    while stack:
        current = stack.pop()
        if current == end:
            return True
        if current in visited:
            continue
        visited.add(current)
        stack.extend(adjacency[current])
    return False


def validate_batch_response(
    response: dict,
    targets: list[dict],
    candidate_map: dict[str, list[dict]],
    source_by_code: dict[str, dict],
    existing_edges: list[dict],
) -> tuple[dict[str, dict], list[dict], list[str]]:
    errors: list[str] = []
    target_codes = {str(item["codigo"]) for item in targets}
    progressions: dict[str, dict] = {}
    raw_items = response.get("itens")
    if not isinstance(raw_items, list):
        raise ValueError("Resposta sem a lista obrigatória 'itens'.")
    for item in raw_items:
        if not isinstance(item, dict):
            errors.append("item de progressão ignorado: formato inválido")
            continue
        code = str(item.get("codigo") or "").strip().upper()
        if code not in target_codes or code in progressions:
            errors.append(f"item de progressão fora dos alvos ou duplicado: {code or '(vazio)'}")
            continue
        fio = item.get("fio") if isinstance(item.get("fio"), dict) else {}
        name = re.sub(r"\s+", " ", str(fio.get("nome") or "")).strip()
        summary = re.sub(r"\s+", " ", str(fio.get("resumo") or "")).strip()
        explanation = re.sub(r"\s+", " ", str(item.get("explicacao") or "")).strip()
        try:
            phase = int(item.get("faseSugerida"))
        except (TypeError, ValueError):
            phase = 0
        if not 3 <= len(name) <= 90:
            errors.append(f"{code}: nome do fio ausente ou fora do limite")
            continue
        if not 12 <= len(summary) <= 500:
            errors.append(f"{code}: resumo do fio ausente ou fora do limite")
            continue
        if phase not in {1, 2, 3, 4, 5}:
            errors.append(f"{code}: faseSugerida deve ser inteiro entre 1 e 5")
            continue
        if len(explanation) < 20:
            errors.append(f"{code}: explicacao curta ou ausente")
            continue
        progressions[code] = {
            "fio": {"nome": name, "resumo": summary},
            "faseSugerida": phase,
            "explicacao": explanation,
        }
    missing_items = target_codes - set(progressions)
    if missing_items:
        raise ValueError("Resposta incompleta para alvos: " + ", ".join(sorted(missing_items)))

    allowed_pairs = {
        (candidate["codigo"], target_code)
        for target_code, candidates in candidate_map.items()
        for candidate in candidates
    }
    clean_edges: list[dict] = []
    per_target: dict[str, int] = defaultdict(int)
    existing_endpoint_pairs = {
        tuple(sorted((edge["de"], edge["para"])))
        for edge in existing_edges
        if edge.get("de") and edge.get("para")
    }
    batch_endpoint_pairs: set[tuple[str, str]] = set()
    raw_edges = response.get("arestas") or []
    if not isinstance(raw_edges, list):
        errors.append("campo 'arestas' não é uma lista; nenhuma aresta da resposta aceita")
        return progressions, [], errors
    for edge in raw_edges:
        if not isinstance(edge, dict):
            errors.append("aresta ignorada: formato inválido")
            continue
        source = str(edge.get("de") or "").strip().upper()
        target = str(edge.get("para") or "").strip().upper()
        target_code = target
        kind = str(edge.get("tipo") or "").strip().lower()
        foundation = str(edge.get("fundamento") or "").strip().lower()
        confidence = str(edge.get("confianca") or "").strip().lower()
        rationale = re.sub(r"\s+", " ", str(edge.get("justificativa") or "")).strip()
        pair = (source, target)
        if pair not in allowed_pairs or target not in target_codes:
            errors.append(f"par fora das candidatas permitidas: {source} -> {target}")
            continue
        if source == target or kind not in RELATION_TYPES:
            errors.append(f"aresta inválida: {source} -> {target} ({kind})")
            continue
        if foundation not in FOUNDATIONS or confidence not in CONFIDENCE or len(rationale) < 30:
            errors.append(f"atributos ausentes ou inválidos: {source} -> {target}")
            continue
        source_item, target_item = source_by_code[source], source_by_code[target]
        if kind == "paralela":
            if stage_for(source_item) != stage_for(target_item) or not _temporal_overlap(source_item, target_item):
                errors.append(f"paralela fora da mesma etapa/faixa: {source} -> {target}")
                continue
            source, target = sorted((source, target))
            pair = (source, target)
        elif not source_precedes(source_item, target_item):
            errors.append(f"origem posterior ao destino: {source} -> {target}")
            continue
        if foundation == "explicito_na_bncc":
            source_text = str(source_by_code[source].get("habilidade") or "").upper()
            target_text = str(source_by_code[target].get("habilidade") or "").upper()
            if source not in target_text and target not in source_text:
                errors.append(f"fundamento explícito sem referência textual verificável: {source} -> {target}")
                continue
        endpoint_pair = tuple(sorted((source, target)))
        if endpoint_pair in existing_endpoint_pairs:
            errors.append(f"aresta repetida, invertida ou conflitante: {source} -> {target}")
            continue
        if endpoint_pair in batch_endpoint_pairs:
            errors.append(f"aresta duplicada, invertida ou conflitante no lote: {source} -> {target}")
            continue
        if per_target[target_code] >= MAX_RELATIONS_PER_TARGET:
            errors.append(f"limite de {MAX_RELATIONS_PER_TARGET} arestas de entrada excedido em {target_code}")
            continue
        proposed = {"de": source, "para": target, "tipo": kind}
        if _path_exists(existing_edges + clean_edges, target, source):
            errors.append(f"ciclo rejeitado: {source} -> {target}")
            continue
        clean_edges.append({
            **proposed,
            "escopo": expected_scope(source_item, target_item),
            "fundamento": foundation,
            "confianca": confidence,
            "justificativa": rationale,
        })
        batch_endpoint_pairs.add(endpoint_pair)
        per_target[target_code] += 1
    return progressions, clean_edges, errors


def _existing_wire_catalog(suggestions: dict[str, dict], source_by_code: dict[str, dict], targets: list[dict]) -> list[dict]:
    target_components = {normalized_component(item) for item in targets}
    catalog: dict[str, dict] = {}
    for code, suggestion in suggestions.items():
        source = source_by_code.get(code)
        if not source or normalized_component(source) not in target_components:
            continue
        wire = suggestion.get("fio") or {}
        name, summary = wire.get("nome"), wire.get("resumo")
        if name:
            entry = catalog.setdefault(name, {
                "nome": name,
                "resumo": summary or "",
                "componentes": [normalized_component(source)],
                "itensVinculados": 0,
            })
            entry["itensVinculados"] += 1
    consolidated = [entry for entry in catalog.values() if entry["itensVinculados"] >= 2]
    return sorted(consolidated, key=lambda item: (-item["itensVinculados"], item["nome"].casefold()))[:18]


def _remaining_split_targets(targets: list[dict], suggestions: dict[str, dict]) -> list[dict]:
    """Return only targets not yet persisted during an interrupted split recovery."""
    return [item for item in targets if item["codigo"] not in suggestions]


def _load_checkpoint(path: Path, dataset_hash: str, generation_config: dict) -> dict:
    if not path.exists():
        return {
            "meta": {"datasetSha256": dataset_hash, "promptVersion": PROMPT_VERSION, "generationConfig": generation_config},
            "suggestions": {},
            "edges": [],
            "batches": {},
            "errors": {},
            "rejections": {},
        }
    state = read_json(path)
    meta = state.get("meta") or {}
    if meta.get("datasetSha256") != dataset_hash:
        raise RuntimeError("A matriz mudou desde o checkpoint. Use outro diretório de checkpoint para não misturar gerações.")
    if meta.get("promptVersion") != PROMPT_VERSION:
        raise RuntimeError("A versão do prompt mudou desde o checkpoint. Preserve esse estado e configure outro --state-dir para iniciar uma nova geração.")
    stored_config = meta.get("generationConfig")
    if stored_config != generation_config:
        old_config = stored_config if isinstance(stored_config, dict) else {}
        old_output_limit = old_config.get("maxOutputTokens")
        new_output_limit = generation_config.get("maxOutputTokens")
        old_without_output = {key: value for key, value in old_config.items() if key != "maxOutputTokens"}
        new_without_output = {key: value for key, value in generation_config.items() if key != "maxOutputTokens"}
        safe_output_increase = (
            isinstance(old_output_limit, int)
            and isinstance(new_output_limit, int)
            and new_output_limit > old_output_limit
            and old_without_output == new_without_output
        )
        if not safe_output_increase:
            raise RuntimeError("Os parâmetros que definem os lotes mudaram desde o checkpoint. Preserve esse estado e use outro --state-dir ou restaure os parâmetros originais.")
        meta.setdefault("generationConfigHistory", []).append(old_config)
        meta["generationConfig"] = generation_config
        atomic_write_json(path, state)
    for key, default in (("suggestions", {}), ("edges", []), ("batches", {}), ("errors", {}), ("rejections", {})):
        state.setdefault(key, default)
    return state


def _write_partial_output(
    output_path: Path,
    base: list[dict],
    source_hashes: dict[str, str],
    state: dict,
    total_batches: int,
    supplemental_by_code: dict[str, dict],
) -> dict:
    models_used = sorted({
        str(model)
        for batch in state.get("batches", {}).values()
        for model in (batch.get("modelosUsados") or [batch.get("modelo")])
        if model and model != "misto"
    })
    generation = {
        "status": "completa" if len(state["suggestions"]) == len(base) and len(state["batches"]) == total_batches else "parcial",
        "alvosConcluidos": len(state["suggestions"]),
        "alvosEsperados": len(base),
        "lotesConcluidos": len(state["batches"]),
        "lotesEsperados": total_batches,
        "lotesComErro": len(state["errors"]),
        "lotesComSugestoesRejeitadas": sum(bool(value) for value in state["rejections"].values()),
        "modelo": models_used[0] if len(models_used) == 1 else "misto" if models_used else MODEL,
        "modeloProximaChamada": MODEL if _free_quota_exhausted else FREE_MODEL,
        "modelosUsados": models_used,
        "atualizadoEm": utc_now().isoformat(),
    }
    notes = {batch_id: values for batch_id, values in state["rejections"].items() if values}
    document = prepare_document(
        base,
        source_hashes,
        state["suggestions"],
        state["edges"],
        generation,
        notes,
        supplemental_by_code,
    )
    atomic_write_json(output_path, document)
    return document


def _batch_id(index: int, targets: list[dict], candidate_map: dict[str, list[dict]]) -> str:
    payload = {
        "targets": [item["codigo"] for item in targets],
        "candidates": {item["codigo"]: [candidate["codigo"] for candidate in candidate_map[item["codigo"]]] for item in targets},
    }
    digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()[:10]
    return f"lote_{index:04d}_{digest}"


def run(args: argparse.Namespace) -> int:
    base = read_json(Path(args.base).resolve())
    raw_supplemental = read_json(Path(args.metadata).resolve())
    if not isinstance(base, list) or not base:
        raise SystemExit("A matriz deve ser uma lista JSON não vazia.")
    codes = [str(item.get("codigo") or "").strip().upper() for item in base]
    if any(not code for code in codes) or len(set(codes)) != len(codes):
        raise SystemExit("A matriz possui código ausente ou duplicado; corrija o inventário antes da geração.")
    unknown = [code for code in codes if not stage_for(code)]
    if unknown:
        raise SystemExit("Há códigos sem etapa reconhecida: " + ", ".join(unknown[:20]))
    source_by_code = {str(item["codigo"]).upper(): item for item in base}
    supplemental_by_code, supplemental_warnings = validate_supplemental_metadata(base, raw_supplemental)
    source_hashes = {
        Path(args.base).name: sha256_file(Path(args.base).resolve()),
        Path(args.metadata).name: sha256_file(Path(args.metadata).resolve()),
    }
    dataset_hash = hashlib.sha256(json.dumps(source_hashes, sort_keys=True).encode()).hexdigest()
    generation_config = {
        "batchSize": args.batch_size,
        "maxCandidates": args.max_candidates,
        "maxPromptChars": args.max_prompt_chars,
        "maxOutputTokens": args.max_output_tokens,
    }
    similarities = pairwise_similarity_map(base)
    candidate_map = {
        str(target["codigo"]): candidate_sources(target, base, args.max_candidates, similarities)
        for target in base
    }
    token_prompt_cap = math.floor((args.tpm - args.max_output_tokens) / 0.70)
    daily_prompt_cap = math.floor((args.daily_tokens - args.max_output_tokens) / 0.70)
    if token_prompt_cap <= 0 or daily_prompt_cap <= 0:
        raise SystemExit("Os orçamentos TPM e diário devem exceder --max-output-tokens.")
    effective_prompt_cap = min(args.max_prompt_chars, token_prompt_cap, daily_prompt_cap)
    generation_config["maxPromptCharsEfetivo"] = effective_prompt_cap
    batches = build_batches(base, candidate_map, args.batch_size, effective_prompt_cap, supplemental_by_code)
    print(f"Fonte: {len(base)} registros | EI {sum(stage_for(x)=='EI' for x in base)} | EF {sum(stage_for(x)=='EF' for x in base)} | EM {sum(stage_for(x)=='EM' for x in base)}")
    print(f"Modelo preferencial: {FREE_MODEL} | ao atingir limite, fallback para {MODEL} dentro do teto pago")
    print(f"Lotes estimados: {len(batches)} | alvos/lote: até {args.batch_size} | candidatas/alvo: até {args.max_candidates}")
    print(f"Guardas locais: {args.rpm} RPM, {args.tpm:,} TPM, {args.daily_requests} chamadas/dia, {args.daily_tokens:,} tokens/dia")
    print("As cotas locais não contabilizam outras chamadas feitas pela mesma conta fora deste script.")
    print(f"Metadados complementares: {len(supplemental_by_code)}/{len(base)} códigos com descrição correspondente; {len(supplemental_warnings)} divergência(s)/ausência(s) ignorada(s).")
    prompt_lengths = [len(prompt_for(batch, candidate_map, [], supplemental_by_code)) for batch in batches]
    estimated_request_tokens = [math.ceil(length * 0.70) + args.max_output_tokens for length in prompt_lengths]
    print(f"Prompt: máximo {max(prompt_lengths, default=0):,}/{effective_prompt_cap:,} caracteres; estimativa de tokens por lote: {max(estimated_request_tokens, default=0):,}/{args.tpm:,} máx.")
    estimated_worst_cost_brl = sum(
        (length * 1.5 * MODEL_INPUT_BRL_PER_MILLION + args.max_output_tokens * MODEL_OUTPUT_BRL_PER_MILLION) / 1_000_000
        for length in prompt_lengths
    )
    print(f"Sabiazinho 4: preços R$ {MODEL_INPUT_BRL_PER_MILLION:.2f}/M entrada + R$ {MODEL_OUTPUT_BRL_PER_MILLION:.2f}/M saída; estimativa conservadora de custo para todos os lotes: R$ {estimated_worst_cost_brl:.2f}.")
    print(f"Teto cumulativo local de custo pago: R$ {args.max_cost_brl:.2f}.")
    if args.dry_run:
        days_by_requests = math.ceil(len(batches) / args.daily_requests)
        days_by_tokens = math.ceil(sum(estimated_request_tokens) / args.daily_tokens)
        print(f"Estimativa conservadora: {sum(estimated_request_tokens):,} tokens de reserva e {len(batches)} chamadas sem retries; mínimo teórico de {max(days_by_requests, days_by_tokens)} dia(s) pelas cotas locais.")
        print("Dry-run: nenhuma chamada, checkpoint ou arquivo de saída foi criado/alterado.")
        return 0

    api_key = get_api_key()
    if not api_key:
        raise SystemExit("MARITACA_API_KEY não encontrada no ambiente. Configure-a localmente; nunca a cole no código ou no chat.")
    state_dir = Path(args.state_dir).resolve()
    checkpoint_path = state_dir / "_checkpoint.json"
    usage_path = Path(args.usage_file).resolve()
    output_path = Path(args.output).resolve()
    state = _load_checkpoint(checkpoint_path, dataset_hash, generation_config)
    state_dir.mkdir(parents=True, exist_ok=True)
    quota = PersistentQuotaGuard(
        usage_path,
        args.rpm,
        args.tpm,
        args.daily_requests,
        args.daily_tokens,
        max_total_cost_brl=args.max_cost_brl,
    )
    free_quota = PersistentQuotaGuard(
        state_dir / "_usage_s5_free.json",
        rpm=60,
        tpm=256_000,
        daily_requests=args.daily_requests,
        daily_tokens=args.daily_tokens,
    )

    # Keep the all-item JSON available throughout a long, interruptible run.
    _write_partial_output(output_path, base, source_hashes, state, len(batches), supplemental_by_code)
    state.setdefault("splitBatchProgress", {})
    pending = []
    skipped_errors = 0
    for index, targets in enumerate(batches):
        batch_id = _batch_id(index, targets, candidate_map)
        if batch_id in state["batches"]:
            continue
        if batch_id in state["errors"] and not args.retry_errors:
            skipped_errors += 1
            continue
        pending.append((batch_id, targets))
    if args.limit_batches:
        pending = pending[:max(0, args.limit_batches)]
    print(f"Concluídos: {len(state['batches'])}/{len(batches)} lotes; pendentes nesta execução: {len(pending)}")
    if skipped_errors:
        print(f"Lotes com erro anterior deixados em espera: {skipped_errors} | use --retry-errors após avaliar o motivo salvo.")
    if not pending:
        print(f"Nada pendente. Saída atualizada: {output_path}")
        return 0

    completed_this_run = 0
    quota_stop = False
    for batch_id, targets in pending:
        target_codes = {item["codigo"] for item in targets}
        if args.split_failed_batches and batch_id in state["errors"]:
            split_progress = state["splitBatchProgress"].setdefault(batch_id, {})
            for target in _remaining_split_targets(targets, state["suggestions"]):
                code = target["codigo"]
                single_candidates = {code: candidate_map[code]}
                catalog = _existing_wire_catalog(state["suggestions"], source_by_code, [target])
                prompt = prompt_for([target], single_candidates, catalog, supplemental_by_code)
                try:
                    response, usage, used_model = call_model_with_fallback(api_key, prompt, free_quota, quota, args.max_output_tokens, args.max_attempts)
                    progressions, new_edges, rejected = validate_batch_response(
                        response, [target], single_candidates, source_by_code, state["edges"]
                    )
                except QuotaLimitReached as exc:
                    print(f"Cota local atingida; interrompendo de forma segura: {exc}")
                    quota_stop = True
                    break
                except Exception as exc:
                    split_progress[code] = {
                        "motivo": f"{type(exc).__name__}: {str(exc)[:250]}",
                        "status": "erro",
                    }
                    state["errors"][batch_id]["subLotes"] = split_progress
                    atomic_write_json(checkpoint_path, state)
                    print(f"{batch_id}/{code}: sublote não concluído ({type(exc).__name__}); demais alvos serão tentados.")
                    continue

                state["suggestions"][code] = progressions[code]
                state["edges"].extend(new_edges)
                split_progress[code] = {
                    "status": "concluido",
                    "modelo": used_model,
                    "usage": usage,
                    "arestasAceitas": len(new_edges),
                    "sugestoesRejeitadas": len(rejected),
                }
                state["errors"][batch_id]["subLotes"] = split_progress
                if rejected:
                    state["rejections"][f"{batch_id}:{code}"] = rejected[:100]
                atomic_write_json(checkpoint_path, state)
                _write_partial_output(output_path, base, source_hashes, state, len(batches), supplemental_by_code)
                print(f"  {code}: 1 alvo classificado, {len(new_edges)} arestas aceitas | {used_model}", flush=True)

            if all(code in state["suggestions"] for code in target_codes):
                usage_totals: dict[str, int] = {}
                for code in target_codes:
                    usage = split_progress.get(code, {}).get("usage", {})
                    for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
                        value = usage.get(key)
                        if isinstance(value, int):
                            usage_totals[key] = usage_totals.get(key, 0) + value
                state["batches"][batch_id] = {
                    "alvos": sorted(target_codes),
                    "modelo": next(iter({split_progress.get(code, {}).get('modelo', MODEL) for code in target_codes})) if len({split_progress.get(code, {}).get('modelo', MODEL) for code in target_codes}) == 1 else "misto",
                    "modelosUsados": sorted({split_progress.get(code, {}).get('modelo', MODEL) for code in target_codes}),
                    "maxOutputTokens": args.max_output_tokens,
                    "usage": usage_totals,
                    "arestasAceitas": sum(split_progress.get(code, {}).get("arestasAceitas", 0) for code in target_codes),
                    "sugestoesRejeitadas": sum(split_progress.get(code, {}).get("sugestoesRejeitadas", 0) for code in target_codes),
                    "estrategia": "sublotes_unitarios",
                    "concluidoEm": utc_now().isoformat(),
                }
                state["errors"].pop(batch_id, None)
                completed_this_run += 1
                atomic_write_json(checkpoint_path, state)
                _write_partial_output(output_path, base, source_hashes, state, len(batches), supplemental_by_code)
                print(f"[{len(state['batches'])}/{len(batches)}] {batch_id}: recuperação unitária concluída | {MODEL}", flush=True)
            else:
                missing = sorted(target_codes - set(state["suggestions"]))
                state["errors"][batch_id]["alvosPendentes"] = missing
                state["errors"][batch_id]["subLotes"] = split_progress
                atomic_write_json(checkpoint_path, state)
                print(f"{batch_id}: ainda faltam {len(missing)} alvo(s): {', '.join(missing)}")
            if quota_stop:
                break
            continue

        target_candidates = {code: candidate_map[code] for code in target_codes}
        catalog = _existing_wire_catalog(state["suggestions"], source_by_code, targets)
        prompt = prompt_for(targets, target_candidates, catalog, supplemental_by_code)
        try:
            response, usage, used_model = call_model_with_fallback(api_key, prompt, free_quota, quota, args.max_output_tokens, args.max_attempts)
            progressions, new_edges, rejected = validate_batch_response(
                response, targets, target_candidates, source_by_code, state["edges"]
            )
        except QuotaLimitReached as exc:
            print(f"Cota local atingida; interrompendo de forma segura: {exc}")
            break
        except Exception as exc:
            state["errors"][batch_id] = {"motivo": f"{type(exc).__name__}: {str(exc)[:250]}", "alvos": sorted(target_codes)}
            atomic_write_json(checkpoint_path, state)
            print(f"{batch_id}: lote não concluído ({type(exc).__name__}); será retomável na próxima execução.")
            continue

        for code, progression in progressions.items():
            state["suggestions"][code] = progression
        state["edges"].extend(new_edges)
        state["batches"][batch_id] = {
            "alvos": sorted(target_codes),
            "modelo": used_model,
            "maxOutputTokens": args.max_output_tokens,
            "usage": usage,
            "arestasAceitas": len(new_edges),
            "sugestoesRejeitadas": len(rejected),
            "concluidoEm": utc_now().isoformat(),
        }
        state["errors"].pop(batch_id, None)
        if rejected:
            state["rejections"][batch_id] = rejected[:100]
        else:
            state["rejections"].pop(batch_id, None)
        atomic_write_json(checkpoint_path, state)
        _write_partial_output(output_path, base, source_hashes, state, len(batches), supplemental_by_code)
        completed_this_run += 1
        print(f"[{len(state['batches'])}/{len(batches)}] {batch_id}: {len(new_edges)} arestas aceitas, {len(rejected)} rejeitadas | {used_model}", flush=True)

    document = _write_partial_output(output_path, base, source_hashes, state, len(batches), supplemental_by_code)
    print(f"Lotes concluídos nesta execução: {completed_this_run}")
    print(f"Alvos classificados: {len(state['suggestions'])}/{len(base)} | arestas canônicas: {len(document['arestas'])}")
    print(f"Custo Sabiazinho reservado/medido neste ledger: R$ {quota.total_cost_reserved_brl():.4f}/R$ {args.max_cost_brl:.2f}")
    print(f"Estado retomável: {checkpoint_path}")
    print(f"Saída: {output_path}")
    if len(state["suggestions"]) < len(base):
        print("Geração parcial; execute novamente o mesmo comando após liberação da cota para retomar.")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=str(BASE_FILE), help="matriz oficial local (JSON)")
    parser.add_argument("--metadata", default=str(METADATA_FILE), help="metadados curriculares complementares indexados por código; só aceita descrição idêntica à matriz")
    parser.add_argument("--output", default=str(OUTPUT_FILE), help="caminho do JSON experimental")
    parser.add_argument("--state-dir", default=str(STATE_DIR), help="diretório local para o checkpoint e estado do experimento; manter fora do controle de versão")
    parser.add_argument("--usage-file", default=str(USAGE_FILE), help="ledger Sabiazinho separado do histórico S5-free")
    parser.add_argument("--max-cost-brl", type=float, default=DEFAULT_MAX_COST_BRL, help="teto cumulativo local de custo Sabiazinho em BRL")
    parser.add_argument("--retry-errors", action="store_true", help="tenta novamente lotes registrados com erro; pode repetir chamadas que falharam por motivos permanentes")
    parser.add_argument("--split-failed-batches", action="store_true", help="na retomada de erros, processa cada alvo separadamente e persiste cada sucesso")
    parser.add_argument("--dry-run", action="store_true", help="calcula escopo, lotes e estimativas sem tocar arquivos nem chamar a API")
    parser.add_argument("--limit-batches", type=int, default=0, help="processa no máximo N lotes pendentes nesta execução; 0 = todos até a cota local")
    parser.add_argument("--batch-size", type=int, default=5, help="itens-alvo por chamada (padrão conservador: 5)")
    parser.add_argument("--max-candidates", type=int, default=6, help="máximo de candidatas de origem por alvo; reserva contexto para progresso no componente e relações interdisciplinares")
    parser.add_argument("--max-prompt-chars", type=int, default=DEFAULT_MAX_PROMPT_CHARS, help="limite preventivo de caracteres por prompt")
    parser.add_argument("--max-output-tokens", type=int, default=DEFAULT_MAX_OUTPUT_TOKENS, help="reserva local de tokens de saída")
    parser.add_argument("--max-attempts", type=int, default=3, help="tentativas por modelo em cada lote")
    parser.add_argument("--rpm", type=int, default=DEFAULT_RPM, help="teto local de requisições por minuto")
    parser.add_argument("--tpm", type=int, default=DEFAULT_TPM, help="teto local estimado de tokens por minuto")
    parser.add_argument("--daily-requests", type=int, default=DEFAULT_DAILY_REQUESTS, help="teto local persistente de chamadas por dia UTC")
    parser.add_argument("--daily-tokens", type=int, default=DEFAULT_DAILY_TOKENS, help="teto local persistente de tokens reservados por dia UTC")
    args = parser.parse_args()
    for name in ("batch_size", "max_candidates", "max_prompt_chars", "max_output_tokens", "max_attempts", "rpm", "tpm", "daily_requests", "daily_tokens"):
        if getattr(args, name) <= 0:
            parser.error(f"--{name.replace('_', '-')} deve ser maior que zero")
    if args.max_cost_brl <= 0:
        parser.error("--max-cost-brl deve ser maior que zero")
    if args.split_failed_batches and not args.retry_errors:
        parser.error("--split-failed-batches requer --retry-errors")
    return args


if __name__ == "__main__":
    try:
        raise SystemExit(run(parse_args()))
    except (OSError, json.JSONDecodeError, ValueError, RuntimeError) as error:
        print(f"Erro: {error}", file=sys.stderr)
        raise SystemExit(2)
