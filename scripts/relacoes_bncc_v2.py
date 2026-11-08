"""Shared source mapping, graph assembly, and validation for BNCC Relations 2."""
from __future__ import annotations

from collections import defaultdict, deque
import copy
import hashlib
import json
import re
import unicodedata
from pathlib import Path
from typing import Any


RELATION_TYPES = {"prerequisito", "retomada", "apoio", "paralela"}
FOUNDATIONS = {"explicito_na_bncc", "inferencia_pedagogica"}
CONFIDENCE = {"alta", "media", "baixa"}
TYPE_PRIORITY = {"prerequisito": 0, "retomada": 1, "apoio": 2, "paralela": 3}
CONFIDENCE_PRIORITY = {"alta": 0, "media": 1, "baixa": 2}
STAGE_PRIORITY = {"EI": 0, "EF": 1, "EM": 2}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage_for(item_or_code: dict | str) -> str:
    code = item_or_code if isinstance(item_or_code, str) else str(item_or_code.get("codigo") or "")
    code = code.strip().upper()
    if code.startswith("EI"):
        return "EI"
    if code.startswith("EF"):
        return "EF"
    if code.startswith("EM"):
        return "EM"
    return ""


def years_for(item_or_code: dict | str) -> list[int]:
    """Return only grade/age numbers encoded by the source code or source label."""
    code = item_or_code if isinstance(item_or_code, str) else str(item_or_code.get("codigo") or "")
    code = code.strip().upper()
    if code.startswith("EI"):
        match = re.match(r"EI([0-9])", code)
        return [int(match.group(1))] if match else []
    if code.startswith("EF"):
        match = re.match(r"EF([0-9]{2})", code)
        if not match:
            return []
        first, second = map(int, match.group(1))
        if first == 0 and 1 <= second <= 9:
            return [second]
        if 1 <= first <= second <= 9:
            return list(range(first, second + 1))
        return []
    if code.startswith("EM13"):
        return [1, 2, 3]
    return []


def recorte_code(item_or_code: dict | str) -> str:
    code = item_or_code if isinstance(item_or_code, str) else str(item_or_code.get("codigo") or "")
    code = code.strip().upper()
    stage = stage_for(code)
    if stage == "EI":
        match = re.match(r"EI([0-9])", code)
        return f"EI{match.group(1)}" if match else "EI-sem-faixa"
    if stage == "EF":
        match = re.match(r"EF([0-9]{2})", code)
        return f"EF{match.group(1)}" if match else "EF-sem-faixa"
    if stage == "EM":
        match = re.match(r"(EM(?:13|IF))", code)
        return match.group(1) if match else "EM-sem-faixa"
    return "sem-etapa"


def normalized_component(item: dict) -> str:
    return str(item.get("disciplina") or "Componente não informado").strip() or "Componente não informado"


def record_group(item: dict) -> str:
    years = years_for(item)
    if stage_for(item) == "EI":
        range_label = recorte_code(item)
    elif years:
        range_label = f"{min(years)}-{max(years)}" if len(years) > 1 else str(years[0])
    else:
        range_label = recorte_code(item)
    return " | ".join((stage_for(item) or "?", normalized_component(item), range_label))


def official_text(item: dict) -> str:
    """Remove an embedded code label while preserving the matrix's wording."""
    code = re.escape(str(item.get("codigo") or ""))
    text = str(item.get("habilidade") or "")
    if code:
        text = re.sub(rf"^\s*\(\s*{code}\s*\)\s*", "", text, count=1, flags=re.I)
    return text.strip()


def normalized_label(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(char for char in value if not unicodedata.combining(char))
    value = re.sub(r"[^A-Za-z0-9]+", "-", value).strip("-").upper()
    return value[:64].strip("-")


def wire_id(name: str) -> str:
    slug = normalized_label(name)
    return f"FIO-{slug}" if slug else "FIO-PENDENTE"


def expected_scope(source: dict, target: dict) -> str:
    source_stage, target_stage = stage_for(source), stage_for(target)
    source_years, target_years = set(years_for(source)), set(years_for(target))
    if source_stage == target_stage and (not source_years or not target_years or source_years.intersection(target_years)):
        return "mesmaEtapa"
    return "entreEtapas"


def source_precedes(source: dict, target: dict) -> bool:
    source_stage, target_stage = stage_for(source), stage_for(target)
    if not source_stage or not target_stage:
        return False
    if STAGE_PRIORITY[source_stage] < STAGE_PRIORITY[target_stage]:
        return True
    if STAGE_PRIORITY[source_stage] > STAGE_PRIORITY[target_stage]:
        return False
    source_years, target_years = years_for(source), years_for(target)
    if not source_years or not target_years:
        return True
    return min(source_years) <= max(target_years)


def build_inventory(base: list[dict]) -> dict:
    groups: dict[str, int] = defaultdict(int)
    stages: dict[str, int] = defaultdict(int)
    components: dict[str, int] = defaultdict(int)
    for item in base:
        groups[record_group(item)] += 1
        stages[stage_for(item) or "desconhecida"] += 1
        components[f"{stage_for(item)} | {normalized_component(item)}"] += 1
    return {
        "totalEsperado": len(base),
        "porRecorte": dict(sorted(groups.items())),
        "porEtapa": dict(sorted(stages.items())),
        "porComponente": dict(sorted(components.items())),
    }


def validate_supplemental_metadata(base: list[dict], supplemental: dict) -> tuple[dict[str, dict], list[str]]:
    """Accept only object labels whose keyed official description matches the matrix exactly."""
    accepted: dict[str, dict] = {}
    warnings = []
    if not isinstance(supplemental, dict):
        return accepted, ["arquivo complementar não contém um objeto JSON indexado por código"]
    for item in base:
        code = str(item.get("codigo") or "")
        extra = supplemental.get(code)
        if not isinstance(extra, dict):
            warnings.append(f"{code}: sem registro complementar")
            continue
        if extra.get("descricao") != item.get("habilidade"):
            warnings.append(f"{code}: descrição complementar diverge; metadados complementares descartados")
            continue
        objects = extra.get("objetos_conhecimento") or []
        if not isinstance(objects, list) or any(not isinstance(value, str) for value in objects):
            warnings.append(f"{code}: objetos_conhecimento complementar em formato inválido")
            continue
        accepted[code] = {"objetos_conhecimento": [value for value in objects if value.strip()]}
    extra_codes = sorted(set(supplemental) - {str(item.get("codigo") or "") for item in base})
    if extra_codes:
        warnings.append(f"{len(extra_codes)} códigos excedentes no arquivo complementar ignorados")
    return accepted, warnings


def _notes_for_source(item: dict, supplemental: dict | None = None) -> list[str]:
    notes = []
    stage = stage_for(item)
    if not official_text(item):
        notes.append("textoOficial ausente na fonte")
    if stage == "EI":
        if not str(item.get("objeto_conhecimento") or "").strip():
            notes.append("campo de experiência ausente na fonte")
    elif stage == "EF":
        if not str(item.get("unidade_tematica") or "").strip():
            notes.append("unidadeTematica ausente na fonte")
        if not str(item.get("objeto_conhecimento") or "").strip():
            notes.append("objetoConhecimento ausente na fonte")
    elif stage == "EM":
        if not str(item.get("unidade_tematica") or "").strip():
            notes.append("unidadeTematica ausente na fonte")
        if not str(item.get("objeto_conhecimento") or "").strip() and not (supplemental or {}).get("objetos_conhecimento"):
            notes.append("objetoConhecimento ausente na fonte")
    else:
        notes.append("etapa não reconhecida pelo padrão do código")
    return notes


def _normalized_year_label(item: dict) -> tuple[str, list[int] | None]:
    stage = stage_for(item)
    years = years_for(item)
    if stage == "EI":
        return str(item.get("ano_faixa") or "faixa etária não informada"), None
    if stage == "EF" and years:
        if len(years) == 1:
            return str(years[0]), None
        return f"{min(years)}º-{max(years)}º", years
    if stage == "EM" and years:
        return f"{min(years)}º-{max(years)}º", years
    return str(item.get("ano_faixa") or "não informado"), None


def build_base_records(
    base: list[dict],
    suggestions: dict[str, dict] | None = None,
    supplemental_by_code: dict[str, dict] | None = None,
) -> list[dict]:
    suggestions = suggestions or {}
    supplemental_by_code = supplemental_by_code or {}
    order_by_code: dict[str, int] = {}
    next_order: dict[str, int] = defaultdict(int)
    for item in base:
        group = record_group(item)
        order_by_code[str(item.get("codigo") or "")] = next_order[group]
        next_order[group] += 1

    records = []
    for item in base:
        code = str(item.get("codigo") or "")
        stage = stage_for(item)
        source_suggestion = suggestions.get(code) or {}
        wire = source_suggestion.get("fio") if isinstance(source_suggestion.get("fio"), dict) else {}
        wire_name = str(wire.get("nome") or "").strip()
        wire_summary = str(wire.get("resumo") or "").strip()
        if not wire_name:
            wire_name = f"Classificação pendente — {normalized_component(item)}"
            wire_summary = "Fio provisório: aguarda a classificação da análise Maritaca."
        fio_key = wire_id(wire_name)
        if fio_key == "FIO-PENDENTE":
            fio_key = f"FIO-PENDENTE-{normalized_label(normalized_component(item)) or 'SEM-COMPONENTE'}"

        year, coverage = _normalized_year_label(item)
        if stage == "EI":
            unit = str(item.get("objeto_conhecimento") or "").strip() or None
            object_knowledge = None
            component = "Educação Infantil"
        else:
            unit = str(item.get("unidade_tematica") or "").strip() or None
            object_knowledge = str(item.get("objeto_conhecimento") or "").strip() or None
            component = normalized_component(item)
        supplemental = supplemental_by_code.get(code) or {}
        official_objects = [
            str(value).strip()
            for value in (supplemental.get("objetos_conhecimento") or [])
            if isinstance(value, str) and value.strip()
        ] if stage != "EI" else []
        notes = _notes_for_source(item, supplemental)
        if code not in suggestions:
            notes.append("classificação de fio e relações ainda não gerada")
        elif not wire_name or not wire_summary:
            notes.append("classificação de fio incompleta na resposta da IA")

        record = {
            "codigo": code,
            "tipoRegistro": "objetivo" if stage == "EI" else "habilidade",
            "componente": component,
            "etapa": stage or None,
            "ano": year,
            "abrangenciaAnos": coverage,
            "unidadeTematica": unit,
            "objetoConhecimento": object_knowledge,
            "textoOficial": official_text(item),
            "ordemDocumento": {"posicaoNoAnoOuLista": order_by_code.get(code, 0)},
            "progressao": {
                "fioId": fio_key,
                "ordemNoFio": 0,
                "faseSugerida": source_suggestion.get("faseSugerida", 1),
                "vinculoPrincipal": {
                    "tipo": "origem",
                    "fundamento": "inferencia_pedagogica",
                    "confianca": "baixa",
                    "justificativa": "A relação principal será derivada das arestas consolidadas; a ordem do código não é evidência pedagógica.",
                },
                "explicacao": str(source_suggestion.get("explicacao") or "A ordem numérica não foi usada como evidência de progressão; relações ainda não consolidadas."),
            },
            "relacoes": {
                "horizontais": {
                    "exigeNesteRecorte": [],
                    "preparaNesteRecorte": [],
                    "arestasEntrantes": [],
                    "arestasSaidas": [],
                },
                "verticais": {
                    "requisitosAnteriores": [],
                    "desdobramentosPosteriores": [],
                    "arestasEntrantes": [],
                    "arestasSaidas": [],
                },
                "paralelas": [],
            },
            "verificacao": {"status": "a_verificar" if notes else "ok", "nota": "; ".join(notes)},
        }
        if official_objects:
            record["objetosConhecimento"] = official_objects
        records.append(record)
    return sorted(records, key=lambda record: record["codigo"])


def _edge_view(edge: dict, related_code: str) -> dict:
    return {
        "arestaId": edge["id"],
        "codigo": related_code,
        "tipoRelacao": edge["tipo"],
        "escopo": edge["escopo"],
        "fundamento": edge["fundamento"],
        "confianca": edge["confianca"],
        "justificativa": edge["justificativa"],
    }


def _wire_order_key(record: dict, stage_by_code: dict[str, dict]) -> tuple:
    source = stage_by_code[record["codigo"]]
    years = years_for(source)
    return (
        int(record["progressao"].get("faseSugerida") or 1),
        STAGE_PRIORITY.get(record.get("etapa"), 9),
        min(years) if years else 99,
        record["ordemDocumento"].get("posicaoNoAnoOuLista", 0),
        record["codigo"],
    )


def _topological_wire_order(codes: list[str], edges: list[dict], records_by_code: dict[str, dict], source_by_code: dict[str, dict]) -> list[str]:
    inside = set(codes)
    adjacency: dict[str, set[str]] = {code: set() for code in codes}
    indegree = {code: 0 for code in codes}
    for edge in edges:
        if edge["tipo"] == "paralela" or edge["de"] not in inside or edge["para"] not in inside:
            continue
        if edge["para"] not in adjacency[edge["de"]]:
            adjacency[edge["de"]].add(edge["para"])
            indegree[edge["para"]] += 1
    key = lambda code: _wire_order_key(records_by_code[code], source_by_code)
    ready = sorted((code for code in codes if indegree[code] == 0), key=key)
    result = []
    while ready:
        code = ready.pop(0)
        result.append(code)
        for target in sorted(adjacency[code], key=key):
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
                ready.sort(key=key)
    if len(result) != len(codes):
        remaining = sorted(inside - set(result), key=key)
        result.extend(remaining)
    return result


def assemble_views(records: list[dict], edges: list[dict], base: list[dict], suggestions: dict[str, dict] | None = None) -> tuple[list[dict], dict[str, list[str]], list[dict]]:
    suggestions = suggestions or {}
    records_by_code = {record["codigo"]: record for record in records}
    source_by_code = {str(item.get("codigo")): item for item in base}

    for record in records:
        record["relacoes"] = {
            "horizontais": {"exigeNesteRecorte": [], "preparaNesteRecorte": [], "arestasEntrantes": [], "arestasSaidas": []},
            "verticais": {"requisitosAnteriores": [], "desdobramentosPosteriores": [], "arestasEntrantes": [], "arestasSaidas": []},
            "paralelas": [],
        }

    for edge in edges:
        source, target = edge["de"], edge["para"]
        source_record, target_record = records_by_code[source], records_by_code[target]
        if edge["tipo"] == "paralela":
            source_record["relacoes"]["paralelas"].append(_edge_view(edge, target))
            target_record["relacoes"]["paralelas"].append(_edge_view(edge, source))
            continue
        axis = "horizontais" if edge["escopo"] == "mesmaEtapa" else "verticais"
        source_axis = source_record["relacoes"][axis]
        target_axis = target_record["relacoes"][axis]
        source_axis["arestasSaidas"].append(_edge_view(edge, target))
        target_axis["arestasEntrantes"].append(_edge_view(edge, source))
        if axis == "horizontais" and edge["tipo"] == "prerequisito":
            target_axis["exigeNesteRecorte"].append(source)
            source_axis["preparaNesteRecorte"].append(target)
        elif axis == "verticais":
            target_axis["requisitosAnteriores"].append(_edge_view(edge, source))
            source_axis["desdobramentosPosteriores"].append(_edge_view(edge, target))

    def view_sort(value: dict) -> tuple:
        return (value.get("codigo", ""), value.get("arestaId", ""), value.get("tipoRelacao", ""))

    for record in records:
        rel = record["relacoes"]
        rel["horizontais"]["exigeNesteRecorte"] = sorted(set(rel["horizontais"]["exigeNesteRecorte"]))
        rel["horizontais"]["preparaNesteRecorte"] = sorted(set(rel["horizontais"]["preparaNesteRecorte"]))
        for axis in ("horizontais", "verticais"):
            for direction in ("arestasEntrantes", "arestasSaidas", "requisitosAnteriores", "desdobramentosPosteriores"):
                if direction in rel[axis]:
                    rel[axis][direction] = sorted(rel[axis][direction], key=view_sort)
        rel["paralelas"] = sorted(rel["paralelas"], key=view_sort)

    incident: dict[str, list[dict]] = defaultdict(list)
    for edge in edges:
        incident[edge["de"]].append(edge)
        incident[edge["para"]].append(edge)
    for record in records:
        options = incident.get(record["codigo"], [])
        options.sort(key=lambda edge: (
            TYPE_PRIORITY.get(edge["tipo"], 9),
            CONFIDENCE_PRIORITY.get(edge["confianca"], 9),
            0 if edge["para"] == record["codigo"] else 1,
            edge["id"],
        ))
        if options:
            main = options[0]
            record["progressao"]["vinculoPrincipal"] = {
                "tipo": main["tipo"],
                "fundamento": main["fundamento"],
                "confianca": main["confianca"],
                "justificativa": main["justificativa"],
            }
            suggestion = suggestions.get(record["codigo"]) or {}
            record["progressao"]["explicacao"] = str(suggestion.get("explicacao") or (
                f"O vínculo principal validado é {main['tipo']} com {main['de'] if main['para'] == record['codigo'] else main['para']}; a ordem numérica do código não determina essa relação."
            ))
        else:
            suggestion = suggestions.get(record["codigo"]) or {}
            record["progressao"]["vinculoPrincipal"] = {
                "tipo": "origem",
                "fundamento": "inferencia_pedagogica",
                "confianca": "baixa",
                "justificativa": "Nenhuma relação direta defensável foi identificada entre as candidatas analisadas; isso não prova que outras relações não existam.",
            }
            record["progressao"]["explicacao"] = str(suggestion.get("explicacao") or "Nenhum antecessor direto foi confirmado nesta análise; vizinhança numérica não foi usada como evidência.")

    by_wire: dict[str, list[str]] = defaultdict(list)
    for record in records:
        by_wire[record["progressao"]["fioId"]].append(record["codigo"])
    progressao_por_fio = {}
    for wire, codes in sorted(by_wire.items()):
        ordered = _topological_wire_order(codes, edges, records_by_code, source_by_code)
        progressao_por_fio[wire] = ordered
        for position, code in enumerate(ordered, start=1):
            records_by_code[code]["progressao"]["ordemNoFio"] = position

    wires: dict[str, dict] = {}
    for record in records:
        progress = record["progressao"]
        wire_id_value = progress["fioId"]
        suggestion = suggestions.get(record["codigo"]) or {}
        wire_info = suggestion.get("fio") if isinstance(suggestion.get("fio"), dict) else {}
        name = str(wire_info.get("nome") or f"Classificação pendente — {record['componente']}").strip()
        summary = str(wire_info.get("resumo") or "Fio provisório; aguarda análise Maritaca.").strip()
        entry = wires.setdefault(wire_id_value, {"id": wire_id_value, "nome": name, "componentes": set(), "resumo": summary})
        entry["componentes"].add(record["componente"])
        if summary != entry["resumo"]:
            entry.setdefault("resumosAlternativos", set()).add(summary)
    dictionary = []
    for entry in wires.values():
        result = {**entry, "componentes": sorted(entry["componentes"])}
        if "resumosAlternativos" in result:
            result["resumosAlternativos"] = sorted(result["resumosAlternativos"])
        dictionary.append(result)
    dictionary.sort(key=lambda entry: entry["id"])
    return records, progressao_por_fio, dictionary


def graph_cycles(codes: set[str], edges: list[dict]) -> list[list[str]]:
    adjacency: dict[str, set[str]] = {code: set() for code in codes}
    indegree = {code: 0 for code in codes}
    for edge in edges:
        source, target = edge.get("de"), edge.get("para")
        if source not in codes or target not in codes or target in adjacency[source]:
            continue
        adjacency[source].add(target)
        indegree[target] += 1
    ready = deque(code for code in codes if indegree[code] == 0)
    visited = set()
    while ready:
        code = ready.popleft()
        visited.add(code)
        for target in adjacency[code]:
            indegree[target] -= 1
            if indegree[target] == 0:
                ready.append(target)
    remaining = sorted(code for code in codes if code not in visited)
    return [remaining] if remaining else []


def _view_has(items: list[dict], edge_id: str, code: str) -> bool:
    return any(item.get("arestaId") == edge_id and item.get("codigo") == code for item in items if isinstance(item, dict))


def validate_document(document: dict, base: list[dict], supplemental_by_code: dict[str, dict] | None = None) -> dict:
    supplemental_by_code = supplemental_by_code or {}
    expected_by_code = {str(item.get("codigo")): item for item in base if item.get("codigo")}
    records = document.get("registros") if isinstance(document.get("registros"), list) else []
    record_by_code = {str(record.get("codigo")): record for record in records if isinstance(record, dict) and record.get("codigo")}
    expected_codes, present_codes = set(expected_by_code), set(record_by_code)
    edges = document.get("arestas") if isinstance(document.get("arestas"), list) else []
    errors: list[str] = []
    pending: list[str] = []
    dangling: list[dict] = []
    count_differences = []
    duplicate_edges = []
    inverse_edges = []
    edge_keys: dict[tuple, dict] = {}
    directed_pairs: dict[tuple[str, str], dict] = {}
    unordered_dependency_pairs: dict[tuple[str, str], dict] = {}

    missing = sorted(expected_codes - present_codes)
    extra = sorted(present_codes - expected_codes)
    duplicates = sorted(code for code in present_codes if sum(1 for record in records if isinstance(record, dict) and record.get("codigo") == code) > 1)
    if missing:
        count_differences.append({"tipo": "registros_ausentes", "codigos": missing})
    if extra:
        count_differences.append({"tipo": "registros_excedentes", "codigos": extra})
    if duplicates:
        count_differences.append({"tipo": "codigos_duplicados", "codigos": duplicates})
    if [record.get("codigo") for record in records if isinstance(record, dict)] != sorted(record_by_code):
        errors.append("registros não estão ordenados por código")

    for code in sorted(expected_codes & present_codes):
        record, source = record_by_code[code], expected_by_code[code]
        if record.get("textoOficial") != official_text(source):
            errors.append(f"{code}: textoOficial diverge da matriz")
        if record.get("componente") != ("Educação Infantil" if stage_for(source) == "EI" else normalized_component(source)):
            errors.append(f"{code}: componente diverge da matriz")
        if record.get("etapa") != stage_for(source):
            errors.append(f"{code}: etapa diverge do código/matriz")
        if stage_for(source) == "EI":
            expected_unit = str(source.get("objeto_conhecimento") or "").strip() or None
            expected_object = None
        else:
            expected_unit = str(source.get("unidade_tematica") or "").strip() or None
            expected_object = str(source.get("objeto_conhecimento") or "").strip() or None
        if record.get("unidadeTematica") != expected_unit:
            errors.append(f"{code}: unidadeTematica diverge da matriz/derivação EI documentada")
        if record.get("objetoConhecimento") != expected_object:
            errors.append(f"{code}: objetoConhecimento diverge da matriz")
        expected_objects = []
        if stage_for(source) != "EI":
            expected_objects = [
                str(value).strip()
                for value in ((supplemental_by_code.get(code) or {}).get("objetos_conhecimento") or [])
                if isinstance(value, str) and value.strip()
            ]
        if expected_objects and record.get("objetosConhecimento") != expected_objects:
            errors.append(f"{code}: objetosConhecimento diverge da referência complementar validada")
        expected_kind = "objetivo" if stage_for(source) == "EI" else "habilidade"
        if record.get("tipoRegistro") != expected_kind:
            errors.append(f"{code}: tipoRegistro inválido")
        expected_year, expected_coverage = _normalized_year_label(source)
        if record.get("ano") != expected_year or record.get("abrangenciaAnos") != expected_coverage:
            errors.append(f"{code}: ano/abrangenciaAnos diverge do padrão do código e da matriz")
        if record.get("verificacao", {}).get("status") == "a_verificar":
            note = record.get("verificacao", {}).get("nota") or "revisão necessária"
            pending.append(f"{code}: {note}")
        progress = record.get("progressao") or {}
        if not progress.get("fioId") or str(progress.get("fioId", "")).startswith("FIO-PENDENTE"):
            pending.append(f"{code}: fio pendente")

    for edge in edges:
        if not isinstance(edge, dict):
            errors.append("aresta não é objeto")
            continue
        source, target = edge.get("de"), edge.get("para")
        if source not in expected_codes or target not in expected_codes:
            dangling.append({"id": edge.get("id"), "de": source, "para": target})
            continue
        if source == target:
            errors.append(f"{edge.get('id')}: autorrelação {source}")
        if edge.get("tipo") not in RELATION_TYPES:
            errors.append(f"{edge.get('id')}: tipo de aresta inválido")
        if edge.get("fundamento") not in FOUNDATIONS:
            errors.append(f"{edge.get('id')}: fundamento inválido")
        if edge.get("confianca") not in CONFIDENCE:
            errors.append(f"{edge.get('id')}: confiança inválida")
        if edge.get("escopo") not in {"mesmaEtapa", "entreEtapas"}:
            errors.append(f"{edge.get('id')}: escopo inválido")
        if not isinstance(edge.get("justificativa"), str) or len(edge.get("justificativa", "").strip()) < 20:
            errors.append(f"{edge.get('id')}: justificativa ausente ou curta")
        if edge.get("escopo") != expected_scope(expected_by_code[source], expected_by_code[target]):
            errors.append(f"{edge.get('id')}: escopo incompatível com etapa/recorte")
        if edge.get("tipo") == "paralela":
            if stage_for(expected_by_code[source]) != stage_for(expected_by_code[target]):
                errors.append(f"{edge.get('id')}: paralela atravessa etapas")
            if source >= target:
                errors.append(f"{edge.get('id')}: paralela não usa orientação canônica por código")
            key = ("paralela", min(source, target), max(source, target))
        else:
            key = (edge.get("tipo"), source, target)
            pair = (source, target)
            unordered_pair = tuple(sorted((source, target)))
            previous_for_pair = unordered_dependency_pairs.get(unordered_pair)
            if previous_for_pair:
                duplicate_edges.append({"aresta": edge.get("id"), "duplicadaDe": previous_for_pair.get("id"), "tipo": "mesmo par de endpoints"})
            else:
                unordered_dependency_pairs[unordered_pair] = edge
            reverse = directed_pairs.get((target, source))
            if reverse:
                inverse_edges.append({"aresta": edge.get("id"), "inversaDe": reverse.get("id"), "par": [source, target]})
            directed_pairs[pair] = edge
            if edge.get("tipo") in {"prerequisito", "retomada", "apoio"} and not source_precedes(expected_by_code[source], expected_by_code[target]):
                errors.append(f"{edge.get('id')}: direção temporal não defensável pelos recortes")
        if key in edge_keys:
            duplicate_edges.append({"aresta": edge.get("id"), "duplicadaDe": edge_keys[key].get("id")})
        else:
            edge_keys[key] = edge
        if not edge.get("id"):
            errors.append("aresta sem id")

        source_record = record_by_code.get(source)
        target_record = record_by_code.get(target)
        if source_record is None or target_record is None:
            continue
        source_rel, target_rel = source_record.get("relacoes", {}), target_record.get("relacoes", {})
        if edge.get("tipo") == "paralela":
            if not _view_has(source_rel.get("paralelas", []), edge.get("id"), target):
                errors.append(f"{edge.get('id')}: visão paralela ausente no endpoint {source}")
            if not _view_has(target_rel.get("paralelas", []), edge.get("id"), source):
                errors.append(f"{edge.get('id')}: visão paralela ausente no endpoint {target}")
            continue

        axis = "horizontais" if edge.get("escopo") == "mesmaEtapa" else "verticais"
        if not _view_has(source_rel.get(axis, {}).get("arestasSaidas", []), edge.get("id"), target):
            errors.append(f"{edge.get('id')}: visão de saída ausente em {source}")
        if not _view_has(target_rel.get(axis, {}).get("arestasEntrantes", []), edge.get("id"), source):
            errors.append(f"{edge.get('id')}: visão de entrada ausente em {target}")
        if axis == "horizontais" and edge.get("tipo") == "prerequisito":
            if target not in source_rel.get(axis, {}).get("preparaNesteRecorte", []):
                errors.append(f"{edge.get('id')}: preparaNesteRecorte ausente em {source} para {target}")
            if source not in target_rel.get(axis, {}).get("exigeNesteRecorte", []):
                errors.append(f"{edge.get('id')}: exigeNesteRecorte ausente em {target}")
        if axis == "verticais":
            if not _view_has(target_rel.get(axis, {}).get("requisitosAnteriores", []), edge.get("id"), source):
                errors.append(f"{edge.get('id')}: requisitosAnteriores ausente em {target}")
            if not _view_has(source_rel.get(axis, {}).get("desdobramentosPosteriores", []), edge.get("id"), target):
                errors.append(f"{edge.get('id')}: desdobramentosPosteriores ausente em {source}")

    codes = expected_codes & present_codes
    cycles = graph_cycles(codes, edges)
    if duplicate_edges:
        errors.append(f"{len(duplicate_edges)} aresta(s) duplicada(s)")
    if inverse_edges:
        errors.append(f"{len(inverse_edges)} par(es) de arestas invertidas")
    if dangling:
        errors.append(f"{len(dangling)} aresta(s) sem referência válida")
    if cycles:
        errors.append("grafo contém ciclo(s)")

    wires = document.get("dicionarioFios") if isinstance(document.get("dicionarioFios"), list) else []
    wire_ids = {wire.get("id") for wire in wires if isinstance(wire, dict) and wire.get("id")}
    used_wire_ids = {record.get("progressao", {}).get("fioId") for record in records if isinstance(record, dict)}
    if used_wire_ids - wire_ids:
        errors.append("há registros com fioId ausente do dicionarioFios")
    progress_by_wire = document.get("progressaoPorFio") if isinstance(document.get("progressaoPorFio"), dict) else {}
    if set(progress_by_wire) != used_wire_ids:
        errors.append("progressaoPorFio não corresponde aos fios usados nos registros")
    listed_codes = []
    for fio, fio_codes in progress_by_wire.items():
        if not isinstance(fio_codes, list):
            errors.append(f"progressaoPorFio.{fio} não é uma lista")
            continue
        listed_codes.extend(fio_codes)
        for index, code in enumerate(fio_codes, start=1):
            record = record_by_code.get(code)
            if not record or record.get("progressao", {}).get("fioId") != fio:
                errors.append(f"progressaoPorFio.{fio} referencia registro incompatível: {code}")
            elif record.get("progressao", {}).get("ordemNoFio") != index:
                errors.append(f"{code}: ordemNoFio diverge de progressaoPorFio")
    if len(listed_codes) != len(set(listed_codes)) or set(listed_codes) != present_codes:
        errors.append("progressaoPorFio não inclui cada registro exatamente uma vez")

    all_endpoints_present = all(
        isinstance(edge, dict) and edge.get("de") in record_by_code and edge.get("para") in record_by_code
        for edge in edges
    )
    if all_endpoints_present:
        rebuilt_records, rebuilt_progress, _rebuilt_wires = assemble_views(copy.deepcopy(records), edges, base, {})
        rebuilt_by_code = {record["codigo"]: record for record in rebuilt_records}
        for code, record in record_by_code.items():
            if record.get("relacoes") != rebuilt_by_code[code].get("relacoes"):
                errors.append(f"{code}: visões contêm relações ausentes, extras ou divergentes das arestas canônicas")
        if progress_by_wire != rebuilt_progress:
            errors.append("progressaoPorFio diverge da ordenação topológica e dos registros")

    expected_inventory = build_inventory(base)
    output_inventory = (document.get("meta") or {}).get("inventario") or {}
    actual_group_counts: dict[str, int] = defaultdict(int)
    for record in records:
        if record.get("codigo") in expected_by_code:
            actual_group_counts[record_group(expected_by_code[record["codigo"]])] += 1
    inventory_groups = expected_inventory["porRecorte"]
    inventory_diffs = [
        {"recorte": group, "esperado": expected_count, "presente": actual_group_counts.get(group, 0)}
        for group, expected_count in inventory_groups.items()
        if actual_group_counts.get(group, 0) != expected_count
    ]
    if output_inventory.get("totalEsperado") != len(base):
        errors.append("meta.inventario.totalEsperado diverge da matriz")
    if output_inventory.get("porRecorte") != inventory_groups:
        errors.append("meta.inventario.porRecorte diverge da matriz")
    if inventory_diffs:
        count_differences.extend(inventory_diffs)

    inferences = sum(edge.get("fundamento") == "inferencia_pedagogica" for edge in edges if isinstance(edge, dict))
    inference_percent = round(inferences * 100 / len(edges), 2) if edges else 0.0
    generation = (document.get("meta") or {}).get("geracao") or {}
    all_targets_complete = generation.get("status") == "completa" and generation.get("alvosConcluidos") == len(base)
    if not all_targets_complete:
        pending.append(f"geração parcial: {generation.get('alvosConcluidos', 0)}/{len(base)} itens classificados")
    if duplicate_edges:
        pending.append(f"arestas duplicadas detectadas: {len(duplicate_edges)}")
    if inverse_edges:
        pending.append(f"arestas invertidas detectadas: {len(inverse_edges)}")
    for code, notes in (document.get("meta") or {}).get("pendenciasGeracao", {}).items():
        pending.append(f"{code}: {notes}")

    checklist = {
        "totalPresentes": len(present_codes),
        "totalEsperado": len(base),
        "divergenciasDeContagem": count_differences,
        "pendencias": sorted(set(pending)),
        "percentualInferencias": inference_percent,
        "ciclosDetectados": cycles,
        "arestasSemReferencia": dangling,
        "consistenciaVisaoAresta": "ok" if not any("visão" in error for error in errors) else "divergente",
    }
    structural_valid = not errors and not count_differences and not duplicate_edges and not inverse_edges and not dangling and not cycles
    return {
        "valido": structural_valid,
        "validoParaFinalizacao": structural_valid and all_targets_complete,
        "geracaoCompleta": all_targets_complete,
        "erroCritico": bool(errors or count_differences or duplicate_edges or inverse_edges or dangling or cycles),
        "erros": errors,
        "arestasDuplicadas": duplicate_edges,
        "arestasInvertidas": inverse_edges,
        "inventarioDivergente": inventory_diffs,
        "checklistFinal": checklist,
    }


def prepare_document(
    base: list[dict],
    source_hashes: dict[str, str] | str,
    suggestions: dict[str, dict],
    raw_edges: list[dict],
    generation: dict,
    generation_notes: dict[str, list[str]] | None = None,
    supplemental_by_code: dict[str, dict] | None = None,
) -> dict:
    """Create the canonical JSON; all item views are derived from canonical edges."""
    supplemental_by_code = supplemental_by_code or {}
    if isinstance(source_hashes, str):
        source_hashes = {"bncc_vetores.json": source_hashes}
    source_by_code = {str(item.get("codigo")): item for item in base}
    records = build_base_records(base, suggestions, supplemental_by_code)
    valid_edges = []
    record_by_code = {record["codigo"]: record for record in records}
    for edge in raw_edges:
        source, target = edge.get("de"), edge.get("para")
        if source not in source_by_code or target not in source_by_code:
            continue
        valid_edges.append({
            "de": source,
            "para": target,
            "tipo": edge["tipo"],
            "escopo": expected_scope(source_by_code[source], source_by_code[target]),
            "fundamento": edge["fundamento"],
            "confianca": edge["confianca"],
            "justificativa": edge["justificativa"],
        })
    valid_edges.sort(key=lambda edge: (edge["de"], edge["para"], edge["tipo"]))
    edges = [{"id": f"E{index:05d}", **edge} for index, edge in enumerate(valid_edges, start=1)]
    records, progress_by_wire, wire_dictionary = assemble_views(records, edges, base, suggestions)
    inventory = build_inventory(base)
    pending_notes = {code: notes for code, notes in (generation_notes or {}).items() if notes}
    meta = {
        "projeto": "progressao-bncc",
        "provedor": "Maritaca AI",
        "modelos": generation.get("modelosUsados") or [generation.get("modelo") or "S5-free"],
        "escopo": {"etapas": ["EI", "EF", "EM"], "componentes": sorted({normalized_component(item) for item in base})},
        "versao": "2.0-experimental",
        "geradoEm": generation.get("atualizadoEm"),
        "fontes": [
            {"arquivo": name, "sha256": digest, "papel": "matriz de habilidades e metadados" if name == "bncc_vetores.json" else "campos complementares aceitos somente quando a descrição do código coincide literalmente"}
            for name, digest in sorted(source_hashes.items())
        ],
        "inventario": inventory,
        "geracao": generation,
        "pendenciasGeracao": pending_notes,
        "legendaVinculos": {
            "origem": "Primeiro item identificado no fio analisado; não implica ausência de conhecimentos anteriores.",
            "prerequisito": "Base considerada necessária para desenvolver o item dependente.",
            "retomada": "Conceito retomado ou ampliado em etapa ou recorte posterior.",
            "apoio": "Conexão que pode apoiar o desenvolvimento, sem obrigatoriedade estrita.",
            "paralela": "Conexão temática sem dependência; orientação técnica da aresta é canônica, não pedagógica.",
        },
        "legendaArestas": {
            "prerequisito": "B exige A como ferramenta direta.",
            "retomada": "B retoma ou amplia A.",
            "apoio": "A apoia B sem obrigatoriedade estrita.",
            "paralela": "Conexão temática sem relação de dependência.",
        },
        "regrasDados": {
            "textoOficial": "Derivado literalmente do campo habilidade de bncc_vetores.json, removendo apenas o rótulo inicial do próprio código quando presente.",
            "dadosAusentes": "Campos ausentes na matriz permanecem null e são anotados em verificacao.",
            "metadadosComplementares": "Objetos complementares são preservados em objetosConhecimento somente quando a descrição do mesmo código coincide literalmente com a matriz; arestas de arquivos antigos não são importadas.",
            "fioOrdem": "Ordem derivada por ordenação topológica das relações aceitas por fio; itens sem relação entre si usam fase sugerida e posição na matriz como desempate.",
            "paralelas": "Relações paralelas são espelhadas em relacoes.paralelas e não são descritas como dependências.",
        },
    }
    document = {
        "meta": meta,
        "dicionarioFios": wire_dictionary,
        "registros": records,
        "arestas": edges,
        "progressaoPorFio": progress_by_wire,
        "checklistFinal": {},
    }
    report = validate_document(document, base, supplemental_by_code)
    document["checklistFinal"] = report["checklistFinal"]
    return document
