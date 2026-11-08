import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from auditar_prerequisitos_piloto import sample_targets, candidate_pool, validate


class AuditoriaPrerequisitosTests(unittest.TestCase):
    def setUp(self):
        self.target = {'codigo': 'EF02CI01', 'disciplina': 'Ciências', 'habilidade': 'Identificar materiais em objetos cotidianos.'}
        self.previous = {'codigo': 'EF01CI01', 'disciplina': 'Ciências', 'habilidade': 'Comparar materiais em objetos de uso comum.'}

    def test_only_skills_without_any_incident_edge_are_initial_targets(self):
        edges = [{'de': 'EF01CI01', 'para': 'EF02CI01'}]
        self.assertEqual(sample_targets([self.previous, self.target], edges), [])
        self.assertEqual(len(sample_targets([self.previous, self.target], [])), 2)

    def test_candidate_pool_excludes_future(self):
        self.assertEqual(candidate_pool(self.target, [self.target, self.previous]), [self.previous])

    def test_prerequisite_requires_literal_evidence_from_both_items(self):
        response = {'avaliacoes': [{'codigo': 'EF01CI01', 'classificacao': 'prerequisito', 'evidencias': [
            {'codigo': 'EF01CI01', 'campo': 'habilidade', 'trecho': 'Comparar materiais'},
            {'codigo': 'EF02CI01', 'campo': 'habilidade', 'trecho': 'Identificar materiais'},
        ]}]}
        self.assertEqual(len(validate(response, self.target, [self.previous])), 1)
        response['avaliacoes'][0]['evidencias'][0]['trecho'] = 'trecho inventado'
        with self.assertRaises(ValueError):
            validate(response, self.target, [self.previous])


if __name__ == '__main__':
    unittest.main()
