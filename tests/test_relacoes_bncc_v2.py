from __future__ import annotations

import copy
import io
import json
import sys
import tempfile
import unittest
from unittest import mock
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from gerar_relacoes_bncc_v2_maritaca import (  # noqa: E402
    MODEL,
    PROMPT_VERSION,
    DEFAULT_MAX_OUTPUT_TOKENS,
    PersistentQuotaGuard,
    QuotaLimitReached,
    _load_checkpoint,
    _existing_wire_catalog,
    _remaining_split_targets,
    _safe_http_error_summary,
    build_request_body,
    candidate_sources,
    call_model_with_fallback,
    _temporal_position,
    parse_env_value,
    prompt_for,
    validate_batch_response,
)
from relacoes_bncc_v2 import (  # noqa: E402
    graph_cycles,
    official_text,
    prepare_document,
    stage_for,
    validate_document,
    validate_supplemental_metadata,
    years_for,
)


def source(code: str, stage_component: str, year: str, text: str, unit: str = "", obj: str = "", vector=None):
    return {
        "codigo": code,
        "disciplina": stage_component,
        "ano_faixa": year,
        "unidade_tematica": unit,
        "objeto_conhecimento": obj,
        "habilidade": text,
        "vetor": vector or [1.0, 0.0, 0.0],
    }


class RelationBNCCV2Tests(unittest.TestCase):
    def setUp(self):
        self.base = [
            source("EI01ET01", "Educação Infantil (Espaços, tempos, quantidades, relações e transformações)", "Bebês (zero a 1 ano e 6 meses)", "(EI01ET01) Explorar propriedades de objetos.", obj="Espaços, tempos, quantidades, relações e transformações"),
            source("EF01LP01", "Língua Portuguesa", "1º", "(EF01LP01) Reconhecer a direção da leitura.", "Leitura", "Protocolos de leitura"),
            source("EF01MA01", "Matemática", "1º", "(EF01MA01) Usar números naturais.", "Números", "Contagem"),
            source("EF02LP01", "Língua Portuguesa", "2º", "(EF02LP01) Ampliar práticas de leitura.", "Leitura", "Compreensão"),
            source("EM13MAT101", "Matemática e suas Tecnologias", "1º, 2º, 3º", "Interpretar situações por gráficos.", obj="Funções"),
        ]

    def make_suggestions(self):
        return {
            item["codigo"]: {
                "fio": {"nome": "Raciocínio e representação", "resumo": "Desenvolvimento de estratégias de representação."},
                "faseSugerida": 1 if item["codigo"].startswith("EI") else 2,
                "explicacao": "A sequência decorre das aprendizagens descritas, não da proximidade dos códigos.",
            }
            for item in self.base
        }

    def test_stage_and_code_range_recognition(self):
        self.assertEqual(stage_for("EI02ET03"), "EI")
        self.assertEqual(stage_for("EF69LP01"), "EF")
        self.assertEqual(stage_for("EM13MAT101"), "EM")
        self.assertEqual(years_for("EF08MA01"), [8])
        self.assertEqual(years_for("EF69LP01"), [6, 7, 8, 9])
        self.assertEqual(years_for("EM13MAT101"), [1, 2, 3])

    def test_official_text_removes_only_leading_matching_code(self):
        item = source("EF01LP01", "Língua Portuguesa", "1º", " (EF01LP01)  Texto oficial, com pontuação.")
        self.assertEqual(official_text(item), "Texto oficial, com pontuação.")
        item["habilidade"] = "Menciona (EF01LP01) no meio do texto."
        self.assertEqual(official_text(item), "Menciona (EF01LP01) no meio do texto.")

    def test_env_parser_does_not_need_to_expose_secret(self):
        text = "# comentário\nOUTRA=ignorar\nexport MARITACA_API_KEY='segredo-de-teste'\n"
        self.assertEqual(parse_env_value(text, "MARITACA_API_KEY"), "segredo-de-teste")
        self.assertIsNone(parse_env_value("MARITACA_API_KEY=\n", "MARITACA_API_KEY"))

    def test_http_error_summary_is_short_and_redacts_credentials(self):
        body = json.dumps({"error": {"message": "invalid request using secret-token-value"}}).encode()
        error = urllib.error.HTTPError("https://example.invalid", 400, "Bad Request", {}, io.BytesIO(body))

        summary = _safe_http_error_summary(error, "secret-token-value")

        self.assertIn("HTTP 400", summary)
        self.assertIn("invalid request", summary)
        self.assertNotIn("secret-token-value", summary)

    def test_sabiazinho_request_omits_s5_only_reasoning_parameter(self):
        self.assertEqual(MODEL, "sabiazinho-4")
        body = build_request_body(MODEL, "Return JSON.", 2400)
        self.assertEqual(body["model"], "sabiazinho-4")
        self.assertNotIn("reasoning_effort", body)
        self.assertEqual(build_request_body("S5-free", "prompt", 100)["reasoning_effort"], "none")

    def test_free_model_falls_back_only_on_quota(self):
        import gerar_relacoes_bncc_v2_maritaca as generator
        with mock.patch.object(generator, '_free_quota_exhausted', False), mock.patch.object(
            generator, 'call_model', side_effect=[QuotaLimitReached('limite'), ({'ok': True}, {'total_tokens': 10})]
        ) as call:
            response, _, model = call_model_with_fallback('key', 'prompt', object(), object(), 100)
            self.assertEqual(response, {'ok': True})
            self.assertEqual(model, 'sabiazinho-4')
            self.assertEqual([entry.kwargs['model'] for entry in call.call_args_list], ['S5-free', 'sabiazinho-4'])

    def test_free_model_other_errors_do_not_trigger_paid_fallback(self):
        import gerar_relacoes_bncc_v2_maritaca as generator
        with mock.patch.object(generator, '_free_quota_exhausted', False), mock.patch.object(
            generator, 'call_model', side_effect=RuntimeError('invalid JSON')
        ) as call:
            with self.assertRaises(RuntimeError):
                call_model_with_fallback('key', 'prompt', object(), object(), 100)
            self.assertEqual(call.call_count, 1)

    def test_paid_quota_tracks_reconciled_cost_and_enforces_total_cap(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            guard = PersistentQuotaGuard(
                Path(temp_dir) / "paid_usage.json",
                rpm=12,
                tpm=64_000,
                daily_requests=60,
                daily_tokens=500_000,
                max_total_cost_brl=0.50,
            )
            first, _ = guard.reserve(1000, estimated_cost_brl=0.30)
            guard.reconcile(first, 500, "concluido", actual_cost_brl=0.10)
            second, _ = guard.reserve(1000, estimated_cost_brl=0.30)

            self.assertAlmostEqual(guard.total_cost_reserved_brl(), 0.40)
            with self.assertRaises(QuotaLimitReached):
                guard.reserve(1000, estimated_cost_brl=0.20)
            guard.reconcile(second, None, "http_400")
            self.assertAlmostEqual(guard.total_cost_reserved_brl(), 0.40)

    def test_checkpoint_keeps_completed_work_when_output_budget_increases(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "_checkpoint.json"
            old_config = {
                "batchSize": 5,
                "maxCandidates": 8,
                "maxPromptChars": 22_000,
                "maxOutputTokens": 2_400,
                "maxPromptCharsEfetivo": 22_000,
            }
            new_config = {**old_config, "maxOutputTokens": DEFAULT_MAX_OUTPUT_TOKENS}
            old_state = {
                "meta": {"datasetSha256": "fixture-hash", "promptVersion": PROMPT_VERSION, "generationConfig": old_config},
                "suggestions": {"EF01LP01": {"preserved": True}},
                "edges": [],
                "batches": {"done": {"alvos": ["EF01LP01"]}},
            }
            path.write_text(json.dumps(old_state), encoding="utf-8")

            loaded = _load_checkpoint(path, "fixture-hash", new_config)

            self.assertIn("EF01LP01", loaded["suggestions"])
            self.assertIn("done", loaded["batches"])
            self.assertEqual(loaded["meta"]["generationConfig"], new_config)
            self.assertEqual(loaded["meta"]["generationConfigHistory"], [old_config])

    def test_supplement_is_accepted_only_when_official_description_matches(self):
        raw = {
            item["codigo"]: {"descricao": item["habilidade"], "objetos_conhecimento": [item["objeto_conhecimento"]] if item["objeto_conhecimento"] else []}
            for item in self.base
        }
        raw["EF01LP01"]["descricao"] = "texto divergente"
        accepted, warnings = validate_supplemental_metadata(self.base, raw)
        self.assertNotIn("EF01LP01", accepted)
        self.assertIn("EF01MA01", accepted)
        self.assertTrue(any("EF01LP01" in warning for warning in warnings))

    def test_candidate_pool_excludes_future_recortes_and_is_bounded(self):
        target = next(item for item in self.base if item["codigo"] == "EF02LP01")
        candidates = candidate_sources(target, self.base, 2)
        self.assertLessEqual(len(candidates), 2)
        self.assertTrue(all(item["codigo"] != "EF02LP01" for item in candidates))
        self.assertNotIn("EM13MAT101", [item["codigo"] for item in candidates])

    def test_candidate_pool_reserves_component_and_interdisciplinary_periods(self):
        target = next(item for item in self.base if item["codigo"] == "EF02LP01")
        same_component_same_phase = source("EF02LP02", "Língua Portuguesa", "2º", "Ampliar a compreensão de textos.")
        same_phase_interdisciplinary = source("EF02MA02", "Matemática", "2º", "Comparar e registrar quantidades.")
        expanded_base = [*self.base, same_component_same_phase, same_phase_interdisciplinary]

        candidates = candidate_sources(target, expanded_base, 16)
        candidate_codes = {item["codigo"] for item in candidates}

        self.assertIn("EF01LP01", candidate_codes)  # previous, same component
        self.assertIn("EF02LP02", candidate_codes)  # same phase, same component
        self.assertIn("EF02MA02", candidate_codes)  # same phase, interdisciplinary
        self.assertIn("EF01MA01", candidate_codes)  # earlier, interdisciplinary
        self.assertEqual(_temporal_position(self.base[1], target), "anterior")
        self.assertEqual(_temporal_position(same_phase_interdisciplinary, target), "mesma_fase")
        self.assertNotIn("EM13MAT101", candidate_codes)

    def test_wire_catalog_only_reuses_consolidated_threads(self):
        suggestions = {
            "EF01LP01": {"fio": {"nome": "Trilha de leitura", "resumo": "Práticas de leitura em desenvolvimento."}},
            "EF02LP01": {"fio": {"nome": "Trilha de leitura", "resumo": "Práticas de leitura em desenvolvimento."}},
            "EF01MA01": {"fio": {"nome": "Contagem", "resumo": "Uso inicial de números."}},
        }
        source_by_code = {item["codigo"]: item for item in self.base}
        target = [source_by_code["EF02LP01"]]

        catalog = _existing_wire_catalog(suggestions, source_by_code, target)

        self.assertEqual([wire["nome"] for wire in catalog], ["Trilha de leitura"])
        self.assertEqual(catalog[0]["itensVinculados"], 2)

    def test_split_recovery_skips_targets_already_persisted(self):
        targets = [{"codigo": "EI01EO01"}, {"codigo": "EI03ET05"}, {"codigo": "EI03ET06"}]
        remaining = _remaining_split_targets(targets, {"EI03ET05": {"fio": {"nome": "Persistido"}}})

        self.assertEqual([item["codigo"] for item in remaining], ["EI01EO01", "EI03ET06"])

    def test_prompt_requests_shared_progression_threads_not_one_wire_per_item(self):
        target = next(item for item in self.base if item["codigo"] == "EF02LP01")
        candidates = {target["codigo"]: [self.base[1]]}

        prompt = prompt_for([target], candidates, [])

        self.assertIn("compare os alvos ENTRE SI", prompt)
        self.assertIn("Evite criar um fio exclusivo para cada alvo", prompt)
        self.assertIn("habilidades anteriores do mesmo componente", prompt)
        self.assertIn("habilidades interdisciplinares do mesmo ano/fase", prompt)
        self.assertIn("não classifique a relação como “horizontal” ou “vertical”", prompt)

    def test_batch_response_rejects_unknown_pairs_and_accepts_valid_parents(self):
        target = next(item for item in self.base if item["codigo"] == "EF02LP01")
        candidate = next(item for item in self.base if item["codigo"] == "EF01LP01")
        candidates = {target["codigo"]: [candidate]}
        response = {
            "itens": [{
                "codigo": "EF02LP01",
                "fio": {"nome": "Leitura", "resumo": "Práticas de leitura e compreensão em progressão."},
                "faseSugerida": 2,
                "explicacao": "O texto amplia práticas de leitura, sem seguir apenas a ordem do código.",
            }],
            "arestas": [
                {"de": "EF01LP01", "para": "EF02LP01", "tipo": "retomada", "fundamento": "inferencia_pedagogica", "confianca": "media", "justificativa": "A habilidade retoma práticas de leitura e amplia sua compreensão em outro recorte."},
                {"de": "EM13MAT101", "para": "EF02LP01", "tipo": "apoio", "fundamento": "inferencia_pedagogica", "confianca": "baixa", "justificativa": "Par não fornecido ao lote e portanto deve ser descartado."},
            ],
        }
        progressions, edges, errors = validate_batch_response(
            response,
            [target],
            candidates,
            {item["codigo"]: item for item in self.base},
            [],
        )
        self.assertEqual(set(progressions), {"EF02LP01"})
        self.assertEqual(len(edges), 1)
        self.assertTrue(any("fora das candidatas" in error for error in errors))

    def test_assembled_views_are_bidirectional_and_dag_is_checked(self):
        suggestions = self.make_suggestions()
        edges = [
            {"de": "EF01LP01", "para": "EF02LP01", "tipo": "prerequisito", "fundamento": "inferencia_pedagogica", "confianca": "media", "justificativa": "A leitura inicial dá suporte direto à ampliação da compreensão no ano seguinte."},
            {"de": "EF01LP01", "para": "EF01MA01", "tipo": "paralela", "fundamento": "inferencia_pedagogica", "confianca": "baixa", "justificativa": "As habilidades conectam formas de representação sem que uma seja requisito da outra."},
        ]
        generation = {
            "status": "completa",
            "alvosConcluidos": len(self.base),
            "atualizadoEm": "2026-11-05T00:00:00Z",
            "modelo": "misto",
            "modelosUsados": ["S5-free", "sabiazinho-4"],
        }
        document = prepare_document(self.base, {"bncc_vetores.json": "abc"}, suggestions, edges, generation)
        report = validate_document(document, self.base)
        self.assertTrue(report["valido"], report["erros"])
        self.assertEqual(document["checklistFinal"]["consistenciaVisaoAresta"], "ok")
        self.assertEqual(document["meta"]["modelos"], ["S5-free", "sabiazinho-4"])
        by_code = {item["codigo"]: item for item in document["registros"]}
        self.assertEqual(by_code["EF02LP01"]["relacoes"]["verticais"]["requisitosAnteriores"][0]["codigo"], "EF01LP01")
        self.assertEqual(len(by_code["EF01LP01"]["relacoes"]["paralelas"]), 1)
        self.assertEqual(len(by_code["EF01MA01"]["relacoes"]["paralelas"]), 1)
        self.assertFalse(graph_cycles(set(by_code), document["arestas"]))

    def test_horizontal_prerequisite_records_destination_in_prepara_view(self):
        suggestions = self.make_suggestions()
        edge = {
            "de": "EF01LP01",
            "para": "EF01MA01",
            "tipo": "prerequisito",
            "fundamento": "inferencia_pedagogica",
            "confianca": "media",
            "justificativa": "A aprendizagem de leitura de representações pode apoiar a interpretação de registros numéricos no mesmo recorte.",
        }
        generation = {"status": "completa", "alvosConcluidos": len(self.base), "atualizadoEm": "2026-11-05T00:00:00Z"}
        document = prepare_document(self.base, "abc", suggestions, [edge], generation)
        by_code = {item["codigo"]: item for item in document["registros"]}

        self.assertIn("EF01MA01", by_code["EF01LP01"]["relacoes"]["horizontais"]["preparaNesteRecorte"])
        self.assertIn("EF01LP01", by_code["EF01MA01"]["relacoes"]["horizontais"]["exigeNesteRecorte"])
        report = validate_document(document, self.base)
        self.assertTrue(report["valido"], report["erros"])

    def test_cycle_detector_includes_parallel_canonical_edges(self):
        edges = [
            {"de": "A", "para": "B", "tipo": "prerequisito"},
            {"de": "B", "para": "C", "tipo": "apoio"},
            {"de": "C", "para": "A", "tipo": "paralela"},
        ]
        self.assertEqual(graph_cycles({"A", "B", "C"}, edges), [["A", "B", "C"]])

    def test_document_validator_detects_changed_endpoint_view(self):
        suggestions = self.make_suggestions()
        edge = {"de": "EF01LP01", "para": "EF02LP01", "tipo": "retomada", "fundamento": "inferencia_pedagogica", "confianca": "media", "justificativa": "A segunda habilidade retoma e expande as práticas descritas na primeira."}
        generation = {"status": "completa", "alvosConcluidos": len(self.base), "atualizadoEm": "2026-11-05T00:00:00Z"}
        document = prepare_document(self.base, "abc", suggestions, [edge], generation)
        damaged = copy.deepcopy(document)
        record = next(item for item in damaged["registros"] if item["codigo"] == "EF02LP01")
        record["relacoes"]["verticais"]["arestasEntrantes"] = []
        report = validate_document(damaged, self.base)
        self.assertFalse(report["valido"])
        self.assertTrue(any("visões" in error for error in report["erros"]))


if __name__ == "__main__":
    unittest.main()
