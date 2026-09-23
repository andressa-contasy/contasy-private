import { supabase } from './supabase';
import { emCentavos } from './formatacao';

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const nomeMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];
export const rotuloMes = (mes: string) => `${nomeMes(mes)} / ${mes.slice(0, 4)}`;

export function deslocarMes(mes: string, delta: number) {
  const [ano, m] = mes.split('-').map(Number);
  const indice = ano * 12 + (m - 1) + delta;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`;
}

export const contarMeses = (de: string, ate: string) =>
  (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) + 1;

// Todos os valores monetários deste módulo estão em centavos
// aliquota: percentual digitado pelo contador (null = não informada)
// juros/multa: encargos por atraso no pagamento daquele imposto (normalmente zero)
export type ImpostoLinha = {
  codigo: string;
  nome: string;
  ordem: number;
  valor: number;
  aliquota: number | null;
  juros: number;
  multa: number;
};

export type LancamentoCompleto = {
  id: string;
  mes: string; // 'AAAA-MM'
  faturamento: number;
  cenario: number;
  nfeQtd: number;
  nfeValor: number;
  nfseQtd: number;
  nfseValor: number;
  impostos: ImpostoLinha[];
  totalImpostos: number;
  remuneracao: { socioId: string; proLabore: number; distribuicao: number }[];
  acoes: { titulo: string; descricao: string }[];
};

export type SocioPainel = { id: string; nome: string; cota: number; ordem: number };

export type EmpresaPainel = {
  id: string;
  nome_empresa: string | null;
  cnpj: string | null;
  regime_tributario: string | null;
  regime_anterior: string | null;
  porte: string | null;
  contador: { nome: string; crc: string } | null;
};

export type DadosEmpresa = {
  empresa: EmpresaPainel;
  socios: SocioPainel[];
  lancamentos: LancamentoCompleto[]; // do mais antigo para o mais recente
};

export async function carregarDados(empresaId: string): Promise<DadosEmpresa> {
  const [emp, soc, fin] = await Promise.all([
    supabase
      .from('empresas')
      .select('id, nome_empresa, cnpj, regime_tributario, regime_anterior, porte, contadores(nome, crc)')
      .eq('id', empresaId)
      .single(),
    supabase.from('socios').select('id, nome, cota_percentual, ordem').eq('empresa_id', empresaId).order('ordem'),
    supabase.from('financeiro_empresas').select('*').eq('empresa_id', empresaId).order('mes_referencia'),
  ]);

  if (emp.error) throw new Error(`Empresa não encontrada: ${emp.error.message}`);
  if (soc.error) throw new Error(`Erro ao carregar sócios: ${soc.error.message}`);
  if (fin.error) throw new Error(`Erro ao carregar lançamentos: ${fin.error.message}`);

  const financeiro = fin.data ?? [];
  const ids: string[] = financeiro.map((l) => l.id);

  const vazio = { data: [], error: null };
  const [imp, rem, aco] = ids.length
    ? await Promise.all([
        supabase
          .from('lancamento_impostos')
          .select('lancamento_id, valor, aliquota, juros, multa, tipos_imposto(codigo, nome, ordem)')
          .in('lancamento_id', ids),
        supabase
          .from('remuneracao_socios')
          .select('lancamento_id, socio_id, pro_labore, distribuicao_lucros')
          .in('lancamento_id', ids),
        supabase.from('acoes_mes').select('lancamento_id, titulo, descricao, ordem').in('lancamento_id', ids).order('ordem'),
      ])
    : [vazio, vazio, vazio];

  const falha = imp.error ?? rem.error ?? aco.error;
  if (falha) throw new Error(`Erro ao carregar detalhes dos lançamentos: ${falha.message}`);

  const impostosPor = (imp.data ?? []) as unknown as Array<{
    lancamento_id: string;
    valor: number;
    aliquota: number | null;
    juros: number;
    multa: number;
    tipos_imposto: { codigo: string; nome: string; ordem: number };
  }>;

  const lancamentos: LancamentoCompleto[] = financeiro.map((l) => {
    const impostos = impostosPor
      .filter((i) => i.lancamento_id === l.id)
      .map((i) => ({
        ...i.tipos_imposto,
        valor: emCentavos(i.valor),
        aliquota: i.aliquota === null ? null : Number(i.aliquota),
        juros: emCentavos(i.juros),
        multa: emCentavos(i.multa),
      }));
    return {
      id: l.id,
      mes: l.mes_referencia,
      faturamento: emCentavos(l.faturamento),
      cenario: emCentavos(l.cenario_sem_otimizacao),
      nfeQtd: l.nfe_produto_qtd,
      nfeValor: emCentavos(l.nfe_produto_valor),
      nfseQtd: l.nfse_servico_qtd,
      nfseValor: emCentavos(l.nfse_servico_valor),
      impostos,
      // Total pago por imposto = valor + juros + multa
      totalImpostos: impostos.reduce((t, i) => t + i.valor + i.juros + i.multa, 0),
      remuneracao: (rem.data ?? [])
        .filter((r) => r.lancamento_id === l.id)
        .map((r) => ({
          socioId: r.socio_id,
          proLabore: emCentavos(r.pro_labore),
          distribuicao: emCentavos(r.distribuicao_lucros),
        })),
      acoes: (aco.data ?? [])
        .filter((a) => a.lancamento_id === l.id)
        .map((a) => ({ titulo: a.titulo, descricao: a.descricao })),
    };
  });

  const contador = (emp.data as unknown as { contadores: { nome: string; crc: string } | null }).contadores;

  return {
    empresa: {
      id: emp.data.id,
      nome_empresa: emp.data.nome_empresa,
      cnpj: emp.data.cnpj,
      regime_tributario: emp.data.regime_tributario,
      regime_anterior: emp.data.regime_anterior,
      porte: emp.data.porte,
      contador: contador ?? null,
    },
    socios: (soc.data ?? []).map((s) => ({
      id: s.id,
      nome: s.nome,
      cota: Number(s.cota_percentual),
      ordem: s.ordem,
    })),
    lancamentos,
  };
}

const soma = (lista: LancamentoCompleto[], campo: (l: LancamentoCompleto) => number) =>
  lista.reduce((total, l) => total + campo(l), 0);

const cargaDe = (lista: LancamentoCompleto[]) => {
  const fat = soma(lista, (l) => l.faturamento);
  return fat > 0 ? (soma(lista, (l) => l.totalImpostos) / fat) * 100 : null;
};

export type ResultadoPainel = {
  meses: number;
  temDados: boolean;
  faturamento: number;
  variacaoFaturamento: number | null; // % vs. período anterior de mesmo tamanho
  totalImpostos: number;
  carga: number | null;
  cargaMenorQueAnterior: boolean;
  cenario: number;
  economiaAno: number;
  nfe: { qtd: number; valor: number };
  nfse: { qtd: number; valor: number };
  totalNfs: number;
  // aliquota: a digitada; 'variavel' = mudou entre os meses do período; null = não informada
  // valor: só o imposto (principal); juros/multa: encargos por atraso, somados à parte
  impostos: {
    codigo: string;
    nome: string;
    valor: number;
    juros: number;
    multa: number;
    aliquota: number | 'variavel' | null;
  }[];
  socios: { id: string; nome: string; ordem: number; proLabore: number; distribuicao: number }[];
  acoes: { mes: string; titulo: string; descricao: string }[];
  evolucao: { mes: string; carga: number }[];
};

// Calcula tudo o que o painel mostra para o período [de, ate] (meses 'AAAA-MM', inclusive).
// Com um só mês, os valores são daquele mês; com vários, são somados.
export function calcularPainel(dados: DadosEmpresa, de: string, ate: string): ResultadoPainel {
  const noIntervalo = (a: string, b: string) => dados.lancamentos.filter((l) => l.mes >= a && l.mes <= b);

  const meses = contarMeses(de, ate);
  const atuais = noIntervalo(de, ate);
  const anteriores = noIntervalo(deslocarMes(de, -meses), deslocarMes(de, -1));
  const noAno = noIntervalo(`${ate.slice(0, 4)}-01`, ate);

  const faturamento = soma(atuais, (l) => l.faturamento);
  const faturamentoAnterior = soma(anteriores, (l) => l.faturamento);
  const totalImpostos = soma(atuais, (l) => l.totalImpostos);
  const carga = cargaDe(atuais);
  const cargaAnterior = cargaDe(anteriores);

  // Impostos somados por tipo, na ordem do catálogo. A alíquota nunca é calculada: é a que o
  // contador digitou. Se algum mês do período está sem alíquota, fica "não informada"; se ela
  // mudou entre os meses, fica "variável".
  const porImposto = new Map<
    string,
    {
      codigo: string;
      nome: string;
      ordem: number;
      valor: number;
      juros: number;
      multa: number;
      aliquotas: (number | null)[];
    }
  >();
  for (const l of atuais) {
    for (const i of l.impostos) {
      const atual = porImposto.get(i.codigo);
      if (atual) {
        atual.valor += i.valor;
        atual.juros += i.juros;
        atual.multa += i.multa;
        atual.aliquotas.push(i.aliquota);
      } else {
        porImposto.set(i.codigo, {
          codigo: i.codigo,
          nome: i.nome,
          ordem: i.ordem,
          valor: i.valor,
          juros: i.juros,
          multa: i.multa,
          aliquotas: [i.aliquota],
        });
      }
    }
  }
  const impostos = [...porImposto.values()]
    .filter((i) => i.valor > 0 || i.juros > 0 || i.multa > 0)
    .sort((a, b) => a.ordem - b.ordem)
    .map((i) => {
      const informadas = i.aliquotas.filter((a): a is number => a !== null);
      const distintas = new Set(informadas.map((a) => a.toFixed(4)));
      const aliquota =
        informadas.length < i.aliquotas.length ? null : distintas.size === 1 ? informadas[0] : ('variavel' as const);
      return { codigo: i.codigo, nome: i.nome, valor: i.valor, juros: i.juros, multa: i.multa, aliquota };
    });

  // Pró-labore e distribuição de lucros ficam sempre separados. Com mais de um mês
  // selecionado, cada um soma o período (não há acumulado do ano por sócio).
  const socios = dados.socios.map((s) => {
    const doPeriodo = atuais.flatMap((l) => l.remuneracao).filter((r) => r.socioId === s.id);
    return {
      id: s.id,
      nome: s.nome,
      ordem: s.ordem,
      proLabore: doPeriodo.reduce((t, r) => t + r.proLabore, 0),
      distribuicao: doPeriodo.reduce((t, r) => t + r.distribuicao, 0),
    };
  });

  // Evolução da carga: últimos 6 meses até o fim do período (ou o período todo, se for maior)
  const inicioEvolucao = meses > 6 ? de : deslocarMes(ate, -5);
  const evolucao = noIntervalo(inicioEvolucao, ate)
    .map((l) => ({ mes: l.mes, carga: cargaDe([l]) }))
    .filter((p): p is { mes: string; carga: number } => p.carga !== null);

  return {
    meses,
    temDados: atuais.length > 0,
    faturamento,
    variacaoFaturamento: faturamentoAnterior > 0 ? (faturamento / faturamentoAnterior - 1) * 100 : null,
    totalImpostos,
    carga,
    cargaMenorQueAnterior: carga !== null && cargaAnterior !== null && carga < cargaAnterior,
    cenario: soma(atuais, (l) => l.cenario),
    // Economia acumulada no ano: só conta os meses em que o cenário sem otimização foi informado
    economiaAno: noAno.filter((l) => l.cenario > 0).reduce((t, l) => t + (l.cenario - l.totalImpostos), 0),
    nfe: { qtd: soma(atuais, (l) => l.nfeQtd), valor: soma(atuais, (l) => l.nfeValor) },
    nfse: { qtd: soma(atuais, (l) => l.nfseQtd), valor: soma(atuais, (l) => l.nfseValor) },
    totalNfs: soma(atuais, (l) => l.nfeQtd + l.nfseQtd),
    impostos,
    socios,
    acoes: atuais.flatMap((l) => l.acoes.map((a) => ({ mes: l.mes, ...a }))),
    evolucao,
  };
}
