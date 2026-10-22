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
  periodicidade: 'mensal' | 'trimestral';
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
  // Notas de entrada: só registram quantidade (sem valor), para controle contábil — não
  // entram na Receita nem na alíquota efetiva
  entradaProdutoQtd: number;
  entradaServicoQtd: number;
  // Impostos sobre NF de entrada/serviços tomados: não entram no Total de Impostos
  // Apurados nem na Carga Tributária Efetiva, por enquanto
  entradaImpostoValor: number;
  entradaImpostoAliquota: number | null;
  servicoTomadoImpostoValor: number;
  servicoTomadoImpostoAliquota: number | null;
  impostos: ImpostoLinha[];
  totalImpostos: number;
  remuneracao: { socioId: string; distribuicao: number; tributos: number }[];
  folha: { nome: string; tipo: 'socio' | 'colaborador'; valor: number; tributos: number }[];
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

  // Periodicidade de cada imposto, conforme o regime da empresa (para marcar os trimestrais
  // na composição do relatório). Se o regime mudou ao longo do tempo, isso reflete o regime
  // atual — é só uma marcação visual, não afeta nenhum cálculo.
  const periodicidadePorCodigo = new Map<string, 'mensal' | 'trimestral'>();
  if (emp.data?.regime_tributario) {
    const { data: regimeImp } = await supabase
      .from('regimes_impostos')
      .select('periodicidade, tipos_imposto(codigo)')
      .eq('regime', emp.data.regime_tributario);
    for (const r of (regimeImp ?? []) as unknown as Array<{
      periodicidade: 'mensal' | 'trimestral';
      tipos_imposto: { codigo: string };
    }>) {
      periodicidadePorCodigo.set(r.tipos_imposto.codigo, r.periodicidade);
    }
  }

  const financeiro = fin.data ?? [];
  const ids: string[] = financeiro.map((l) => l.id);

  const vazio = { data: [], error: null };
  const [imp, rem, aco, fol] = ids.length
    ? await Promise.all([
        supabase
          .from('lancamento_impostos')
          .select('lancamento_id, valor, aliquota, juros, multa, tipos_imposto(codigo, nome, ordem)')
          .in('lancamento_id', ids),
        supabase
          .from('remuneracao_socios')
          .select('lancamento_id, socio_id, distribuicao_lucros, tributos')
          .in('lancamento_id', ids),
        supabase.from('acoes_mes').select('lancamento_id, titulo, descricao, ordem').in('lancamento_id', ids).order('ordem'),
        supabase.from('folha_pagamento').select('lancamento_id, nome, tipo, valor, tributos').in('lancamento_id', ids),
      ])
    : [vazio, vazio, vazio, vazio];

  const falha = imp.error ?? rem.error ?? aco.error ?? fol.error;
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
        periodicidade: periodicidadePorCodigo.get(i.tipos_imposto.codigo) ?? 'mensal',
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
      entradaProdutoQtd: l.entrada_produto_qtd ?? 0,
      entradaServicoQtd: l.entrada_servico_qtd ?? 0,
      entradaImpostoValor: emCentavos(l.entrada_imposto_valor),
      entradaImpostoAliquota: l.entrada_imposto_aliquota === null ? null : Number(l.entrada_imposto_aliquota),
      servicoTomadoImpostoValor: emCentavos(l.servico_tomado_imposto_valor),
      servicoTomadoImpostoAliquota:
        l.servico_tomado_imposto_aliquota === null ? null : Number(l.servico_tomado_imposto_aliquota),
      impostos,
      // Total pago por imposto = valor + juros + multa
      totalImpostos: impostos.reduce((t, i) => t + i.valor + i.juros + i.multa, 0),
      remuneracao: (rem.data ?? [])
        .filter((r) => r.lancamento_id === l.id)
        .map((r) => ({
          socioId: r.socio_id,
          distribuicao: emCentavos(r.distribuicao_lucros),
          tributos: emCentavos(r.tributos),
        })),
      folha: (fol.data ?? [])
        .filter((p) => p.lancamento_id === l.id)
        .map((p) => ({
          nome: p.nome as string,
          tipo: p.tipo as 'socio' | 'colaborador',
          valor: emCentavos(p.valor),
          tributos: emCentavos(p.tributos),
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
  entradaProduto: { qtd: number };
  entradaServico: { qtd: number };
  totalNfs: number;
  // Impostos sobre NF de entrada/serviços tomados: não entram no totalImpostos/carga, por
  // enquanto. aliquota segue a mesma regra dos demais: nunca calculada, só a digitada.
  entradaImposto: { valor: number; aliquota: number | 'variavel' | null };
  servicoTomadoImposto: { valor: number; aliquota: number | 'variavel' | null };
  // aliquota: a digitada; 'variavel' = mudou entre os meses do período; null = não informada
  // valor: só o imposto (principal); juros/multa: encargos por atraso, somados à parte
  impostos: {
    codigo: string;
    nome: string;
    valor: number;
    juros: number;
    multa: number;
    aliquota: number | 'variavel' | null;
    periodicidade: 'mensal' | 'trimestral';
  }[];
  socios: { id: string; nome: string; ordem: number; distribuicao: number; tributos: number }[];
  folha: { nome: string; tipo: 'socio' | 'colaborador'; valor: number; tributos: number }[];
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
      periodicidade: 'mensal' | 'trimestral';
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
          periodicidade: i.periodicidade,
        });
      }
    }
  }
  let impostos = [...porImposto.values()]
    .filter((i) => i.valor > 0 || i.juros > 0 || i.multa > 0)
    // Mensais primeiro, trimestrais no final (dentro de cada grupo, pela ordem do catálogo)
    .sort((a, b) =>
      a.periodicidade === b.periodicidade ? a.ordem - b.ordem : a.periodicidade === 'trimestral' ? 1 : -1,
    )
    .map((i) => {
      const informadas = i.aliquotas.filter((a): a is number => a !== null);
      const distintas = new Set(informadas.map((a) => a.toFixed(4)));
      const aliquota =
        informadas.length < i.aliquotas.length ? null : distintas.size === 1 ? informadas[0] : ('variavel' as const);
      return {
        codigo: i.codigo,
        nome: i.nome,
        valor: i.valor,
        juros: i.juros,
        multa: i.multa,
        aliquota,
        periodicidade: i.periodicidade,
      };
    });

  // No Simples Nacional, o relatório do cliente mostra uma guia só ("Guia PGDAS"), mesmo que
  // o período tenha meses antigos lançados ainda com os impostos detalhados (PIS, COFINS...),
  // de antes da simplificação do regime. O histórico em si não muda, só a soma mostrada aqui.
  if (dados.empresa.regime_tributario === 'simples_nacional' && impostos.length > 0) {
    impostos = [
      {
        codigo: 'PGDAS',
        nome: 'Guia PGDAS',
        valor: impostos.reduce((t, i) => t + i.valor, 0),
        juros: impostos.reduce((t, i) => t + i.juros, 0),
        multa: impostos.reduce((t, i) => t + i.multa, 0),
        // Só reaproveita a alíquota quando o período só tem esse único código (o caso normal
        // daqui pra frente); misturado com impostos antigos, não há uma taxa única válida.
        aliquota: impostos.length === 1 ? impostos[0].aliquota : null,
        periodicidade: 'mensal',
      },
    ];
  }

  // Com mais de um mês selecionado, cada sócio soma o período (não há acumulado do ano).
  const socios = dados.socios.map((s) => {
    const doPeriodo = atuais.flatMap((l) => l.remuneracao).filter((r) => r.socioId === s.id);
    return {
      id: s.id,
      nome: s.nome,
      ordem: s.ordem,
      distribuicao: doPeriodo.reduce((t, r) => t + r.distribuicao, 0),
      tributos: doPeriodo.reduce((t, r) => t + r.tributos, 0),
    };
  });

  // Folha de pagamento: soma por pessoa (nome + tipo) ao longo do período selecionado.
  const folhaPorPessoa = new Map<string, { nome: string; tipo: 'socio' | 'colaborador'; valor: number; tributos: number }>();
  for (const l of atuais) {
    for (const p of l.folha) {
      const chave = `${p.tipo}:${p.nome}`;
      const atual = folhaPorPessoa.get(chave);
      if (atual) {
        atual.valor += p.valor;
        atual.tributos += p.tributos;
      } else {
        folhaPorPessoa.set(chave, { ...p });
      }
    }
  }
  const folha = [...folhaPorPessoa.values()].sort((a, b) =>
    a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === 'socio' ? -1 : 1,
  );

  // Alíquota de um imposto sobre NF de entrada/serviços tomados, somada pelo período: só
  // considera os meses em que houve valor lançado, e nunca calcula — só reaproveita a
  // digitada (null se faltar em algum desses meses; 'variavel' se os meses digitados diferirem).
  const aliquotaEntradaPeriodo = (
    valorCampo: (l: LancamentoCompleto) => number,
    aliquotaCampo: (l: LancamentoCompleto) => number | null,
  ): number | 'variavel' | null => {
    const relevantes = atuais.filter((l) => valorCampo(l) > 0);
    if (relevantes.length === 0) return null;
    const aliquotas = relevantes.map(aliquotaCampo);
    const informadas = aliquotas.filter((a): a is number => a !== null);
    if (informadas.length < aliquotas.length) return null;
    const distintas = new Set(informadas.map((a) => a.toFixed(4)));
    return distintas.size === 1 ? informadas[0] : 'variavel';
  };

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
    entradaProduto: { qtd: soma(atuais, (l) => l.entradaProdutoQtd) },
    entradaServico: { qtd: soma(atuais, (l) => l.entradaServicoQtd) },
    totalNfs: soma(atuais, (l) => l.nfeQtd + l.nfseQtd + l.entradaProdutoQtd + l.entradaServicoQtd),
    entradaImposto: {
      valor: soma(atuais, (l) => l.entradaImpostoValor),
      aliquota: aliquotaEntradaPeriodo((l) => l.entradaImpostoValor, (l) => l.entradaImpostoAliquota),
    },
    servicoTomadoImposto: {
      valor: soma(atuais, (l) => l.servicoTomadoImpostoValor),
      aliquota: aliquotaEntradaPeriodo((l) => l.servicoTomadoImpostoValor, (l) => l.servicoTomadoImpostoAliquota),
    },
    impostos,
    socios,
    folha,
    acoes: atuais.flatMap((l) => l.acoes.map((a) => ({ mes: l.mes, ...a }))),
    evolucao,
  };
}
