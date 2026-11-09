import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from auditar_prerequisitos_continuo import selected_pending, review_status, validate_partial


class AuditoriaContinuaTests(unittest.TestCase):
    def test_resume_only_unexamined_candidates(self):
        state = {'avaliacoes': {'A': {'resultado': {}}}}
        candidates = [{'codigo': 'A'}, {'codigo': 'B'}, {'codigo': 'C'}]
        self.assertEqual(selected_pending(state, candidates, 1), [{'codigo': 'B'}])

    def test_agreement_is_not_homologation(self):
        self.assertEqual(review_status('prerequisito', 'prerequisito'), 'concordante_nao_homologada')
        self.assertEqual(review_status('prerequisito', 'apoio'), 'divergente_revisao_humana')

    def test_invalid_result_does_not_discard_valid_neighbor(self):
        target = {'codigo': 'T', 'habilidade': 'Texto da habilidade alvo'}
        candidates = [{'codigo': 'A', 'habilidade': 'Texto da habilidade anterior'}, {'codigo': 'B', 'habilidade': 'Outro texto anterior'}]
        response = {'avaliacoes': [
            {'codigo': 'A', 'classificacao': 'rejeitada', 'evidencias': []},
            {'codigo': 'B', 'classificacao': 'prerequisito', 'evidencias': []},
        ]}
        accepted, errors = validate_partial(response, target, candidates)
        self.assertEqual([item['codigo'] for item in accepted], ['A'])
        self.assertEqual(len(errors), 1)


if __name__ == '__main__':
    unittest.main()
