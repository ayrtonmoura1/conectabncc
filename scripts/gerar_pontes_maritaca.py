#!/usr/bin/env python3
"""Generate interdisciplinary AI suggestions for all BNCC skills.

Uses Maritaca S5 Free first, then S5 and Sabiazinho 4 only on quota/model errors.
Every response is checkpointed and every returned code is validated against the candidate pool.
"""
from __future__ import annotations

import argparse
import concurrent.futures
from collections import defaultdict, deque
import json
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
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
BASE_FILE = ROOT / "bncc_vetores.json"
REL_FILE = ROOT / "relacoes_bncc_final.json"
OUT_DIR = ROOT / "pontes"
OUTPUT = ROOT / "pontes_interdisciplinares.json"
CHECKPOINT = OUT_DIR / "_checkpoint.json"
RAW_LOG = OUT_DIR / "_respostas_brutas.jsonl"
API_URL = "https://chat.maritaca.ai/api/chat/completions"
MODELS = ("S5-free", "sabiazinho-4")
lock = threading.Lock()


class SlidingWindowRateLimiter:
    """Conservative shared RPM/TPM limiter for concurrent requests and retries."""

    def __init__(self, requests_per_minute: int = 48, tokens_per_minute: int = 220_000):
        self.max_requests = max(1, requests_per_minute)
        self.max_tokens = max(1, tokens_per_minute)
        self.window_seconds = 60.0
        self.events: deque[tuple[float, int]] = deque()
        self.lock = threading.Lock()

    def acquire(self, estimated_tokens: int) -> float:
        estimated_tokens = max(1, min(int(estimated_tokens), self.max_tokens))
        waited = 0.0
        while True:
            with self.lock:
                now = time.monotonic()
                while self.events and now - self.events[0][0] >= self.window_seconds:
                    self.events.popleft()
                used_tokens = sum(tokens for _, tokens in self.events)
                request_limited = len(self.events) >= self.max_requests
                token_limited = used_tokens + estimated_tokens > self.max_tokens
                if not request_limited and not token_limited:
                    self.events.append((now, estimated_tokens))
                    return waited
                # Both quotas use a rolling 60-second window. Wait for the oldest
                # reservation to expire, then recalculate under the lock.
                delay = max(0.05, self.window_seconds - (now - self.events[0][0]) + 0.02)
            time.sleep(delay)
            waited += delay


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def get_years(item: dict) -> set[int]:
    """Return EF grade coverage, including shared BNCC skills such as EF35/EF15."""
    code = (item.get("codigo") or "").upper()
    if not code.startswith("EF"):
        return set()
    explicit = {int(n) for n in re.findall(r"(?<!\d)([1-9])\s*º?", item.get("ano_faixa") or "")}
    if explicit:
        return explicit
    m = re.match(r"EF(\d{2})", code)
    if not m:
        return set()
    band = int(m.group(1))
    if band == 15:
        return set(range(1, 6))
    if band == 35:
        return set(range(3, 6))
    if band <= 5:
        return {band}
    if band <= 9:
        return {band}
    return set()


def stage(item: dict) -> str:
    code = (item.get("codigo") or "").upper()
    if code.startswith("EI"):
        return "EI"
    if code.startswith("EM"):
        return "EM"
    years = get_years(item)
    if years and max(years) <= 5:
        return "EFAI"
    if years and min(years) >= 6:
        return "EFAF"
    return "EF"


def homologated_cross_codes(code: str, rels: dict, by_code: dict) -> set[str]:
    src = by_code[code]
    result = set()
    for r in (rels.get(code, {}).get("relacionadas") or []):
        other = by_code.get(r.get("codigo"))
        if other and other.get("disciplina") != src.get("disciplina"):
            result.add(other["codigo"])
    return result


def build_pool(src: dict, base: list[dict], by_code: dict, rels: dict, per_component: int = 5):
    src_years = get_years(src)
    src_stage = stage(src)
    bucket = defaultdict(list)
    src_vec = np.asarray(src.get("vetor") or [], dtype=np.float32)
    for candidate in base:
        if candidate["codigo"] == src["codigo"] or candidate.get("disciplina") == src.get("disciplina"):
            continue
        if src_stage in ("EI", "EM"):
            if stage(candidate) != src_stage:
                continue
        else:
            cand_years = get_years(candidate)
            if not cand_years or not (src_years & cand_years):
                continue
            if stage(candidate) in ("EI", "EM"):
                continue
        vec = np.asarray(candidate.get("vetor") or [], dtype=np.float32)
        score = float(np.dot(src_vec, vec)) if src_vec.size and vec.size == src_vec.size else 0.0
        bucket[candidate.get("disciplina") or "Componente"].append((score, candidate))

    pool = []
    for component, values in sorted(bucket.items()):
        values.sort(key=lambda pair: (-pair[0], pair[1]["codigo"]))
        pool.extend(item for _, item in values[:per_component])
    # Give the model the approved partners too, tagged so it cannot present them as new.
    approved_codes = homologated_cross_codes(src["codigo"], rels, by_code)
    return pool, approved_codes


def prompt_for(src: dict, pool: list[dict], approved_codes: set[str]) -> str:
    lines = []
    for item in pool:
        # Omit approved partners instead of merely tagging them: this prevents
        # the model from copying official relations into the AI-suggestion layer.
        if item["codigo"] in approved_codes:
            continue
        text = (item.get("habilidade") or "").replace("\n", " ")
        lines.append(
            f"{item['codigo']} | {item.get('disciplina')} | ano {item.get('ano_faixa')} | "
            f"objeto: {item.get('objeto_conhecimento') or 'nao informado'} | {text[:420]}"
        )
    return f"""Voce e especialista em BNCC brasileira e planejamento interdisciplinar nos anos escolares.

HABILIDADE FONTE
Codigo: {src['codigo']}
Componente: {src.get('disciplina')}
Ano/faixa: {src.get('ano_faixa')}
Objeto de conhecimento: {src.get('objeto_conhecimento') or 'nao informado'}
Descricao: {src.get('habilidade')}

CANDIDATAS REAIS (use SOMENTE codigos desta lista):
{chr(10).join(lines)}

TAREFA
Encontre pontes pedagogicas genuinas entre a habilidade-fonte e habilidades de OUTROS componentes. Procure de 3 a 5 componentes quando houver conexoes defensaveis; nao invente nem force para preencher uma cota. Considere diferentes linguagens e praticas escolares, nao apenas palavras iguais.

REGRAS OBRIGATORIAS
- Todo codigo sugerido tem que estar exatamente na lista de candidatas e ser de componente diferente da fonte.
- A lista de candidatas ja exclui relacoes oficiais homologadas; nao invente nem reconstrua codigos.
- Priorize anos/faixas sobrepostos. Habilidades compartilhadas (EF15/EF35) podem ser adequadas quando a faixa inclui o ano da fonte.
- A justificativa explica o mecanismo didatico que une as habilidades; nao basta dizer que ambas trabalham um tema generico.
- A atividade e concreta, realizavel em sala e usa as duas habilidades de forma identificavel.
- Confiança alta/media/baixa deve refletir a força da ponte, nao a qualidade da escrita.
- Se nenhuma ponte for defensavel, retorne por_componente vazio e explique em conceitos.
- Responda em portugues e SOMENTE com um objeto JSON neste formato exato:
{{"codigo_fonte":"{src['codigo']}","conceitos":["conceito-ponte"],"por_componente":[{{"componente":"nome exato do componente candidato","codigos":["EF00XX00"],"justificativa":"...","atividade":"...","confianca":"alta|media|baixa"}}]}}"""


def call_model(
    api_key: str,
    model: str,
    prompt: str,
    limiter: SlidingWindowRateLimiter,
    max_tokens: int = 2400,
):
    # Character-based estimate intentionally rounds upward; reserve the full
    # requested output budget so concurrent work cannot oversubscribe TPM.
    estimated_input = int(len(prompt) / 3.5 * 1.10) + 1
    limiter.acquire(estimated_input + max_tokens)
    body = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"},
        "max_tokens": max_tokens,
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
    content = result["choices"][0]["message"].get("content") or ""
    # Some OpenAI-compatible endpoints wrap otherwise valid JSON in fences.
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.I)
    return json.loads(content), result.get("usage") or {}


def validate_result(src: dict, result: dict, pool: list[dict], by_code: dict, approved: set[str]):
    errors, accepted = [], []
    if result.get("codigo_fonte") != src["codigo"]:
        errors.append(f"codigo_fonte inesperado: {result.get('codigo_fonte')!r}")
    allowed = {item["codigo"]: item for item in pool}
    seen_components, seen_codes = set(), set()
    for group in result.get("por_componente") or []:
        codes = group.get("codigos") or []
        valid_by_component = defaultdict(list)
        for code in codes:
            candidate = allowed.get(code)
            if not candidate:
                errors.append(f"{src['codigo']}: codigo fora do pool: {code}")
                continue
            if code in approved:
                errors.append(f"{src['codigo']}: codigo ja homologado: {code}")
                continue
            if candidate.get("disciplina") == src.get("disciplina"):
                errors.append(f"{src['codigo']}: relacao intradisciplinar: {code}")
                continue
            if code in seen_codes:
                errors.append(f"{src['codigo']}: codigo duplicado: {code}")
                continue
            seen_codes.add(code)
            # O código permitido é a fonte canônica do componente. Corrige
            # variações/erros no rótulo escrito pela IA sem confiar nele.
            canonical_component = candidate.get("disciplina") or "Componente"
            valid_by_component[canonical_component].append(code)
        if not valid_by_component:
            continue
        justification = (group.get("justificativa") or "").strip()
        activity = (group.get("atividade") or "").strip()
        confidence = (group.get("confianca") or "media").lower()
        if len(justification) < 90:
            errors.append(f"{src['codigo']}: justificativa curta")
            continue
        if len(activity) < 60:
            errors.append(f"{src['codigo']}: atividade curta")
            continue
        if confidence not in ("alta", "media", "baixa"):
            confidence = "media"
        for canonical_component, valid_codes in valid_by_component.items():
            if canonical_component in seen_components:
                errors.append(f"{src['codigo']}: componente duplicado: {canonical_component}")
                continue
            seen_components.add(canonical_component)
            accepted.append({
                "componente": canonical_component,
                "codigos": valid_codes,
                "justificativa": justification,
                "atividade": activity,
                "confianca": confidence,
            })
    return {
        "conceitos": [str(x).strip() for x in (result.get("conceitos") or []) if str(x).strip()][:12],
        "por_componente": {group["componente"]: {
            "codigos": group["codigos"],
            "justificativa": group["justificativa"],
            "atividade": group["atividade"],
            "confianca": group["confianca"],
            "origem": "ia_s5_free",
        } for group in accepted},
    }, errors


def load_checkpoint() -> dict:
    if CHECKPOINT.exists():
        return read_json(CHECKPOINT)
    return {"meta": {"versao": "1.0", "provedor": "Maritaca", "modelos": list(MODELS)}, "pontes": {}, "erros": {}}


def save_checkpoint(data: dict):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp = CHECKPOINT.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(CHECKPOINT)
    # Public JSON stays valid/current during a long run, allowing safe interruption.
    export = {"meta": data["meta"], "pontes": data["pontes"]}
    tmp_out = OUTPUT.with_suffix(".tmp")
    tmp_out.write_text(json.dumps(export, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_out.replace(OUTPUT)


def process_one(
    src: dict,
    pool: list[dict],
    approved: set[str],
    by_code: dict,
    api_key: str,
    limiter: SlidingWindowRateLimiter,
):
    prompt = prompt_for(src, pool, approved)
    attempts = []
    errors = []
    for model in MODELS:
        max_attempts = 4 if model == MODELS[0] else 2
        for attempt in range(max_attempts):
            try:
                result, usage = call_model(api_key, model, prompt, limiter)
                clean, validation_errors = validate_result(src, result, pool, by_code, approved)
                # Keep valid groups even when another returned code was invalid; report the rejects.
                return src["codigo"], clean, {"modelo": model, "usage": usage, "validation_errors": validation_errors, "attempts": attempts}
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", "ignore")[:700]
                attempts.append({"modelo": model, "http": exc.code, "erro": body})
                if exc.code not in (408, 409, 429, 500, 502, 503, 504):
                    # Unsupported/free model or auth/model error: proceed to paid fallback.
                    break
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                try:
                    provider_delay = float(retry_after) if retry_after else 0.0
                except (TypeError, ValueError):
                    provider_delay = 0.0
                backoff = min(15 * (2 ** attempt), 90) if exc.code == 429 else min(2 ** (attempt + 1), 12)
                time.sleep(min(max(provider_delay, backoff) + random.random(), 120))
            except (urllib.error.URLError, TimeoutError) as exc:
                attempts.append({"modelo": model, "erro": str(exc)[:300]})
                time.sleep(min(3 * (2 ** attempt), 30) + random.random())
            except Exception as exc:
                attempts.append({"modelo": model, "erro": f"{type(exc).__name__}: {exc}"[:500]})
                break
    return src["codigo"], {"conceitos": [], "por_componente": {}}, {"modelo": None, "usage": {}, "validation_errors": errors, "attempts": attempts}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0, help="process at most N source skills")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--rpm", type=int, default=48, help="request limit per rolling minute (default: 48; provider limit: 60)")
    parser.add_argument("--tpm", type=int, default=220_000, help="estimated input+output token limit per rolling minute (default: 220000; provider limit: 256000)")
    parser.add_argument("--force", action="store_true", help="regenerate checkpointed skills")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    api_key = os.getenv("MARITACA_API_KEY")
    if not api_key and not args.dry_run:
        raise SystemExit("MARITACA_API_KEY nao encontrada no .env")

    base = read_json(BASE_FILE)
    rels = read_json(REL_FILE)
    by_code = {item["codigo"]: item for item in base}
    # Generate AI ideas for every skill. Approved relations stay separate and are
    # passed to the prompt as exclusions, so the AI layer never duplicates them.
    sources = list(base)
    data = load_checkpoint()
    if args.force:
        data["pontes"] = {}
        data["erros"] = {}
    pending = [
        item for item in sources
        if item["codigo"] not in data["pontes"]
        or (not data["pontes"][item["codigo"]].get("por_componente") and not args.force)
    ]
    if args.limit:
        pending = pending[:args.limit]

    pools = {}
    requests = 0
    in_tokens = out_tokens = 0
    for src in pending:
        pool, approved = build_pool(src, base, by_code, rels)
        pools[src["codigo"]] = (pool, approved)
        requests += 1
        # Estimate from the measured production prompt (1550 input / 829 output).
        in_tokens += 1550
        out_tokens += 829
    concluidas_na_base = sum(item["codigo"] in data["pontes"] for item in sources)
    print(f"Fonte: {len(sources)} habilidades BNCC (cobertura completa)")
    print(f"Concluidas no checkpoint: {concluidas_na_base}/{len(sources)}")
    print(f"Pendentes neste run: {len(pending)} | requests estimadas: {requests}")
    print(f"Estimativa medida: {in_tokens:,} input + {out_tokens:,} output tokens")
    print(f"Fallbacks: {' -> '.join(MODELS)} | workers: {args.workers}")
    print(f"Rate limit local: {args.rpm} RPM / {args.tpm:,} TPM (limite informado: 60 RPM / 256.000 TPM)")
    if args.dry_run:
        print("Dry-run: nenhuma chamada feita, nenhum arquivo de saida alterado.")
        return
    if not pending:
        print("Nada pendente.")
        return

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data["meta"].update({
        "versao": "1.0",
        "provedor": "Maritaca AI",
        "modelos": list(MODELS),
        "cobertura": "todas_as_habilidades_bncc",
        "atualizado_em": datetime.now(timezone.utc).isoformat(),
        "fonte": "bncc_vetores.json",
    })
    save_checkpoint(data)
    started = time.time()
    completed = 0
    limiter = SlidingWindowRateLimiter(args.rpm, args.tpm)
    # A shared limiter also covers retries and fallback models, not just first attempts.
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as executor:
        futures = {}
        for src in pending:
            pool, approved = pools[src["codigo"]]
            future = executor.submit(process_one, src, pool, approved, by_code, api_key, limiter)
            futures[future] = src
        for future in concurrent.futures.as_completed(futures):
            code, clean, info = future.result()
            with lock:
                for ponte in clean.get("por_componente", {}).values():
                    ponte["origem"] = "ia_" + re.sub(r"[^a-z0-9]+", "_", (info.get("modelo") or "sem_modelo").lower()).strip("_")
                data["erros"][code] = info
                if clean.get("por_componente") or info.get("modelo"):
                    data["pontes"][code] = clean
                else:
                    data["pontes"].pop(code, None)
                completed += 1
                save_checkpoint(data)
                elapsed = time.time() - started
                print(f"[{completed}/{len(pending)}] {code}: {len(clean['por_componente'])} componentes | {info['modelo'] or 'falha'} | {elapsed:.0f}s", flush=True)

    data["meta"]["atualizado_em"] = datetime.now(timezone.utc).isoformat()
    save_checkpoint(data)
    succeeded = sum(bool(x["por_componente"]) for x in data["pontes"].values())
    groups = [g for x in data["pontes"].values() for g in x["por_componente"].values()]
    print("\n=== Relatorio final ===")
    print(f"Total gerado: {len(data['pontes'])}/{len(sources)}")
    print(f"Com pelo menos uma ponte sugerida: {succeeded}")
    print(f"Grupos de componente: {len(groups)} | media por habilidade: {sum(len(x['por_componente']) for x in data['pontes'].values()) / max(1, len(data['pontes'])):.2f}")
    print(f"Tamanho do arquivo: {OUTPUT.stat().st_size / 1024:.1f} KB")
    bad = [(c, e) for c, e in data["erros"].items() if e.get("validation_errors") or e.get("attempts")]
    print(f"Habilidades com avisos/rejeicoes/retries: {len(bad)}")
    for code, info in bad[:30]:
        print(f"  {code}: rejeicoes={info.get('validation_errors')} tentativas={info.get('attempts')}")


if __name__ == "__main__":
    main()
