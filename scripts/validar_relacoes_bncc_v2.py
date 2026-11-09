#!/usr/bin/env python3
"""Validate coverage, provenance, edge integrity, DAG, and derived views for Relations 2."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from relacoes_bncc_v2 import read_json, validate_document, validate_supplemental_metadata


ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", default=str(ROOT / "relacoes_bncc_v2.json"), help="JSON gerado por gerar_relacoes_bncc_v2_maritaca.py")
    parser.add_argument("--base", default=str(ROOT / "bncc_vetores.json"), help="matriz oficial de habilidades")
    parser.add_argument("--metadata", default=str(ROOT / "relacoes_bncc_final.json"), help="referência complementar; só objetos com descrição literalmente igual são considerados")
    parser.add_argument("--report", default="", help="opcional: salvar relatório JSON em outro arquivo")
    parser.add_argument("--allow-partial", action="store_true", help="permite saída parcial, sem declarar a geração completa")
    args = parser.parse_args()

    document = read_json(Path(args.input).resolve())
    base = read_json(Path(args.base).resolve())
    metadata = read_json(Path(args.metadata).resolve())
    supplemental, warnings = validate_supplemental_metadata(base, metadata)
    report = validate_document(document, base, supplemental)
    report["fonteComplementar"] = {
        "registrosAceitos": len(supplemental),
        "avisosIgnorados": len(warnings),
        "exemplosAvisos": warnings[:30],
    }

    stored_checklist = document.get("checklistFinal")
    if stored_checklist != report["checklistFinal"]:
        report["erros"].append("checklistFinal gravado no documento diverge da validação recalculada")
        report["valido"] = False
        report["validoParaFinalizacao"] = False
        report["erroCritico"] = True

    try:
        record_count = len(document.get("registros", []))
        edge_count = len(document.get("arestas", []))
    except TypeError:
        record_count = edge_count = 0
    print(f"Registros: {record_count}/{len(base)} | arestas canônicas: {edge_count}")
    print(f"Validação estrutural: {'OK' if report['valido'] else 'FALHOU'}")
    print(f"Geração completa: {'sim' if report['geracaoCompleta'] else 'não'}")
    print(f"Percentual de inferências: {report['checklistFinal']['percentualInferencias']}%")
    print(f"Consistência das visões: {report['checklistFinal']['consistenciaVisaoAresta']}")
    print(f"Ciclos: {len(report['checklistFinal']['ciclosDetectados'])} | referências ausentes: {len(report['checklistFinal']['arestasSemReferencia'])} | pendências: {len(report['checklistFinal']['pendencias'])}")
    if report["erros"]:
        print("Erros:")
        for error in report["erros"][:100]:
            print(f"- {error}")
    if report["checklistFinal"]["pendencias"]:
        print("Pendências (amostra):")
        for pending in report["checklistFinal"]["pendencias"][:30]:
            print(f"- {pending}")
    if args.report:
        report_path = Path(args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Relatório salvo: {report_path}")

    if not report["valido"]:
        return 1
    if not report["geracaoCompleta"] and not args.allow_partial:
        print("Use --allow-partial apenas para inspecionar uma saída incompleta; isso não aprova a análise final.")
        return 2
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
        print(f"Erro de validação: {error}", file=sys.stderr)
        raise SystemExit(2)
