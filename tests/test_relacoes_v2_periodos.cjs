const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const start = html.indexOf('        function obterIntervaloCurricularV2(');
const end = html.indexOf('        function obterCodigoFocalV2()', start);
assert.ok(start >= 0 && end > start, 'Funções de classificação não encontradas');

const items = [
    ['EI01EO01', 'Infantil', 'Bebês'], ['EI02EO01', 'Infantil', 'Crianças bem pequenas'],
    ['EF01LP01', 'Língua Portuguesa', '1º'], ['EF02LP01', 'Língua Portuguesa', '2º'],
    ['EF01MA01', 'Matemática', '1º'], ['EF02MA01', 'Matemática', '2º'],
    ['EF15AR01', 'Arte', '1º ao 5º'], ['EM13LP01', 'Língua Portuguesa', '1º ao 3º'],
].map(([codigo, disciplina, ano_faixa]) => ({ codigo, disciplina, ano_faixa }));
const mapaBNCCPorCodigo = new Map(items.map(item => [item.codigo, item]));
const extrairEtapaCurricular = item => {
    const codigo = item.codigo.substring(0, 4);
    if (codigo.startsWith('EI')) return { etapa: 'EI', anos: [0] };
    if (codigo.startsWith('EM')) return { etapa: 'EM', anos: [10, 11, 12] };
    const [first, second] = codigo.slice(2).split('').map(Number);
    const anos = first === 0 ? [second] : Array.from({ length: second - first + 1 }, (_, i) => first + i);
    return { etapa: 'EF_INICIAIS', anos };
};
const context = vm.createContext({ mapaBNCCPorCodigo, extrairEtapaCurricular });
vm.runInContext(html.slice(start, end), context);
const classify = (de, para, focal, tipo = 'apoio') => context.classificarPeriodoRelacaoV2({ de, para, tipo }, focal);

assert.equal(classify('EF01LP01', 'EF02LP01', 'EF02LP01').periodo, 'anterior');
assert.equal(classify('EF01LP01', 'EF02LP01', 'EF01LP01').periodo, 'posterior');
assert.equal(classify('EF01MA01', 'EF01LP01', 'EF01LP01').periodo, 'mesma-fase');
assert.equal(classify('EF01MA01', 'EF01LP01', 'EF01LP01').natureza, 'interdisciplinar');
assert.equal(classify('EF01LP01', 'EF15AR01', 'EF01LP01').periodo, 'mesma-fase');
assert.equal(classify('EI01EO01', 'EI02EO01', 'EI02EO01').periodo, 'anterior');
assert.equal(classify('EF02LP01', 'EM13LP01', 'EM13LP01').periodo, 'anterior');
assert.equal(classify('EF01LP01', 'EF01MA01', 'EF01LP01', 'paralela').periodo, 'paralela');
console.log('Classificação temporal Relações 2: 8 verificações passaram.');
