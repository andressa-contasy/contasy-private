'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import {
  brl,
  ehMesFechamentoTrimestre,
  emCentavos,
  formatarCentavos,
  formatarMes,
  mesAtual,
  pct,
  rotuloRegime,
} from '../lib/formatacao';
import { goldButtonClasses, ghostButtonClasses, inputClasses, labelClasses } from '../lib/estilos';

type EmpresaModal = {
  id: string | number;
  nome_empresa: string | null;
  regime_tributario: string | null;
};

type Socio = { id: string; nome: string; cota_percentual: number };

type ImpostoRegime = {
  tipo_imposto_id: string;
  periodicidade: 'mensal' | 'trimestral';
  sugerido: boolean;
  codigo: string;
  nome: string;
  ordem: number;
};

type Lancamento = {
  id: string;
  mes_referencia: string; // 'AAAA-MM'
  faturamento: number;
  cenario_sem_otimizacao: number;
  nfe_produto_qtd: number;
  nfe_produto_valor: number;
  nfse_servico_qtd: number;
  nfse_servico_valor: number;
};

type Remuneracao = { proLabore: number; distribuicao: number }; // em centavos
type Acao = { titulo: string; descricao: string };

// "0,65" -> 0.65. Vazio ou fora de 0–100 -> null (sem alíquota informada)
function lerAliquota(texto: string | undefined) {
  if (!texto?.trim()) return null;
  const n = parseFloat(texto.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

const DICAS_IMPOSTO: Record<string, string> = {
  ISS: 'Incide sobre notas de serviço (NFS-e).',
  ICMS: 'Incide sobre notas de produto (NF-e).',
};

function CampoMoeda({
  id,
  rotulo,
  centavos,
  onChange,
  disabled,
  dica,
}: {
  id: string;
  rotulo: string;
  centavos: number;
  onChange: (centavos: number) => void;
  disabled?: boolean;
  dica?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClasses}>
        {rotulo}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={formatarCentavos(centavos)}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '').slice(0, 15);
          onChange(digitos ? Number(digitos) : 0);
        }}
        className={inputClasses}
      />
      {dica && <p className="mt-1 text-xs text-slate-500">{dica}</p>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="sm:col-span-2 rounded-xl border border-[#d8b362]/20 p-4">
      <legend className="px-2 text-sm font-semibold text-[#d8b362]">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export default function LancamentosModal({
  empresa,
  onClose,
  mesInicial,
  onAtualizado,
}: {
  empresa: EmpresaModal;
  onClose: () => void;
  mesInicial?: string;
  onAtualizado?: () => void;
}) {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [totaisImpostos, setTotaisImpostos] = useState<Record<string, number>>({}); // em reais
  const [impostosRegime, setImpostosRegime] = useState<ImpostoRegime[]>([]);
  const [socios, setSocios] = useState<Socio[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [mes, setMes] = useState(mesInicial ?? mesAtual());
  const [faturamento, setFaturamento] = useState(0);
  const [nfeQtd, setNfeQtd] = useState('0');
  const [nfeValor, setNfeValor] = useState(0);
  const [nfseQtd, setNfseQtd] = useState('0');
  const [nfseValor, setNfseValor] = useState(0);
  const [cenario, setCenario] = useState(0);
  const [valoresImposto, setValoresImposto] = useState<Record<string, number>>({});
  // Alíquota (%) de cada imposto, digitada pelo contador (texto, aceita vírgula)
  const [aliquotas, setAliquotas] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<string[]>([]); // impostos não sugeridos ativados pelo usuário
  const [remuneracao, setRemuneracao] = useState<Record<string, Remuneracao>>({});
  const [acoes, setAcoes] = useState<Acao[]>([]);

  const existente = lancamentos.find((l) => l.mes_referencia === mes);
  const trimestreAberto = ehMesFechamentoTrimestre(mes);

  const impostosAtivos = useMemo(
    () => impostosRegime.filter((i) => i.sugerido || extras.includes(i.tipo_imposto_id)),
    [impostosRegime, extras],
  );
  const impostosDisponiveis = impostosRegime.filter((i) => !i.sugerido && !extras.includes(i.tipo_imposto_id));

  // Trimestrais só valem no mês de fechamento do trimestre
  const valorEfetivo = (i: ImpostoRegime) =>
    i.periodicidade === 'trimestral' && !trimestreAberto ? 0 : (valoresImposto[i.tipo_imposto_id] ?? 0);

  const totalImpostos = impostosAtivos.reduce((total, i) => total + valorEfetivo(i), 0);
  const carga = faturamento > 0 ? Math.round((totalImpostos / faturamento) * 10000) / 100 : 0;
  const economia = cenario - totalImpostos;
  const somaNfs = nfeValor + nfseValor;

  const resetCampos = useCallback(() => {
    setFaturamento(0);
    setNfeQtd('0');
    setNfeValor(0);
    setNfseQtd('0');
    setNfseValor(0);
    setCenario(0);
    setValoresImposto({});
    setAliquotas({});
    setExtras([]);
    setRemuneracao({});
    setAcoes([]);
  }, []);

  const carregarBase = useCallback(async () => {
    const regime = empresa.regime_tributario;

    const [socRes, regRes] = await Promise.all([
      supabase.from('socios').select('id, nome, cota_percentual').eq('empresa_id', empresa.id).order('ordem'),
      regime
        ? supabase
            .from('regimes_impostos')
            .select('tipo_imposto_id, periodicidade, sugerido, tipos_imposto(codigo, nome, ordem)')
            .eq('regime', regime)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (socRes.error) setErro(`Erro ao carregar sócios: ${socRes.error.message}`);
    else setSocios(socRes.data ?? []);

    if (regRes.error) {
      setErro(`Erro ao carregar impostos do regime: ${regRes.error.message}`);
    } else {
      const linhas = (regRes.data ?? []) as unknown as Array<{
        tipo_imposto_id: string;
        periodicidade: 'mensal' | 'trimestral';
        sugerido: boolean;
        tipos_imposto: { codigo: string; nome: string; ordem: number };
      }>;
      setImpostosRegime(
        linhas
          .map((l) => ({
            tipo_imposto_id: l.tipo_imposto_id,
            periodicidade: l.periodicidade,
            sugerido: l.sugerido,
            codigo: l.tipos_imposto.codigo,
            nome: l.tipos_imposto.nome,
            ordem: l.tipos_imposto.ordem,
          }))
          .sort((a, b) => a.ordem - b.ordem),
      );
    }
  }, [empresa.id, empresa.regime_tributario]);

  const carregarLancamentos = useCallback(async () => {
    const { data, error } = await supabase
      .from('financeiro_empresas')
      .select('*')
      .eq('empresa_id', empresa.id)
      .order('mes_referencia', { ascending: false });

    if (error) {
      setErro(`Erro ao carregar lançamentos: ${error.message}`);
      setCarregando(false);
      return;
    }

    const lista: Lancamento[] = data ?? [];
    setLancamentos(lista);

    const totais: Record<string, number> = {};
    if (lista.length > 0) {
      const { data: imp, error: erroImp } = await supabase
        .from('lancamento_impostos')
        .select('lancamento_id, valor')
        .in('lancamento_id', lista.map((l) => l.id));

      if (erroImp) setErro(`Erro ao carregar impostos: ${erroImp.message}`);
      for (const linha of imp ?? []) {
        totais[linha.lancamento_id] = (totais[linha.lancamento_id] ?? 0) + Number(linha.valor);
      }
    }
    setTotaisImpostos(totais);
    setCarregando(false);
  }, [empresa.id]);

  useEffect(() => {
    carregarBase();
    carregarLancamentos();
  }, [carregarBase, carregarLancamentos]);

  // Ao trocar o mês: carrega o lançamento existente ou limpa o formulário
  useEffect(() => {
    if (!existente) {
      resetCampos();
      return;
    }

    let cancelado = false;
    (async () => {
      const [imp, rem, aco] = await Promise.all([
        supabase.from('lancamento_impostos').select('tipo_imposto_id, valor, aliquota').eq('lancamento_id', existente.id),
        supabase
          .from('remuneracao_socios')
          .select('socio_id, pro_labore, distribuicao_lucros')
          .eq('lancamento_id', existente.id),
        supabase.from('acoes_mes').select('titulo, descricao').eq('lancamento_id', existente.id).order('ordem'),
      ]);
      if (cancelado) return;

      const falha = imp.error ?? rem.error ?? aco.error;
      if (falha) {
        setErro(`Erro ao carregar o lançamento: ${falha.message}`);
        return;
      }

      setFaturamento(emCentavos(existente.faturamento));
      setNfeQtd(String(existente.nfe_produto_qtd));
      setNfeValor(emCentavos(existente.nfe_produto_valor));
      setNfseQtd(String(existente.nfse_servico_qtd));
      setNfseValor(emCentavos(existente.nfse_servico_valor));
      setCenario(emCentavos(existente.cenario_sem_otimizacao));

      const valores: Record<string, number> = {};
      for (const l of imp.data ?? []) valores[l.tipo_imposto_id] = emCentavos(l.valor);
      setValoresImposto(valores);
      const aliqs: Record<string, string> = {};
      for (const l of imp.data ?? []) {
        if (l.aliquota !== null) aliqs[l.tipo_imposto_id] = String(Number(l.aliquota)).replace('.', ',');
      }
      setAliquotas(aliqs);
      setExtras(
        impostosRegime
          .filter((i) => !i.sugerido && valores[i.tipo_imposto_id] !== undefined)
          .map((i) => i.tipo_imposto_id),
      );

      const rems: Record<string, Remuneracao> = {};
      for (const r of rem.data ?? []) {
        rems[r.socio_id] = { proLabore: emCentavos(r.pro_labore), distribuicao: emCentavos(r.distribuicao_lucros) };
      }
      setRemuneracao(rems);
      setAcoes((aco.data ?? []).map((a) => ({ titulo: a.titulo, descricao: a.descricao })));
    })();

    return () => {
      cancelado = true;
    };
  }, [existente, impostosRegime, resetCampos]);

  // Fecha com a tecla Esc
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  const setRem = (socioId: string, campo: keyof Remuneracao, valor: number) =>
    setRemuneracao((prev) => {
      const atual: Remuneracao = prev[socioId] ?? { proLabore: 0, distribuicao: 0 };
      return { ...prev, [socioId]: { ...atual, [campo]: valor } };
    });

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setSucesso(null);

    const falhou = (etapa: string, mensagem: string) => {
      setErro(`Erro ao salvar ${etapa}: ${mensagem}`);
      setSalvando(false);
    };

    // Confere as alíquotas antes de gravar qualquer coisa
    const invalida = impostosAtivos.find((i) => {
      const texto = aliquotas[i.tipo_imposto_id];
      return texto?.trim() && lerAliquota(texto) === null;
    });
    if (invalida) {
      return falhou('os impostos', `a alíquota de ${invalida.nome} é inválida (use um valor entre 0 e 100).`);
    }

    // 1. Lançamento do mês
    const valores = {
      mes_referencia: mes,
      faturamento: faturamento / 100,
      cenario_sem_otimizacao: cenario / 100,
      nfe_produto_qtd: parseInt(nfeQtd, 10) || 0,
      nfe_produto_valor: nfeValor / 100,
      nfse_servico_qtd: parseInt(nfseQtd, 10) || 0,
      nfse_servico_valor: nfseValor / 100,
    };

    let lancamentoId: string;
    if (existente) {
      const { error } = await supabase.from('financeiro_empresas').update(valores).eq('id', existente.id);
      if (error) return falhou('o lançamento', error.message);
      lancamentoId = existente.id;
    } else {
      const { data, error } = await supabase
        .from('financeiro_empresas')
        .insert({ ...valores, empresa_id: empresa.id })
        .select('id')
        .single();
      if (error) {
        return falhou(
          'o lançamento',
          error.code === '23505' ? 'já existe um lançamento para este mês. Reabra o mês e use "Atualizar".' : error.message,
        );
      }
      lancamentoId = data.id;
    }

    // 2. Impostos (só os com valor; remove os que deixaram de existir)
    const linhasImpostos = impostosAtivos
      .map((i) => ({
        lancamento_id: lancamentoId,
        tipo_imposto_id: i.tipo_imposto_id,
        valor: valorEfetivo(i) / 100,
        aliquota: lerAliquota(aliquotas[i.tipo_imposto_id]),
      }))
      .filter((l) => l.valor > 0);

    if (linhasImpostos.length > 0) {
      const { error } = await supabase
        .from('lancamento_impostos')
        .upsert(linhasImpostos, { onConflict: 'lancamento_id,tipo_imposto_id' });
      if (error) return falhou('os impostos', error.message);
    }
    let remover = supabase.from('lancamento_impostos').delete().eq('lancamento_id', lancamentoId);
    if (linhasImpostos.length > 0) {
      remover = remover.not('tipo_imposto_id', 'in', `(${linhasImpostos.map((l) => l.tipo_imposto_id).join(',')})`);
    }
    {
      const { error } = await remover;
      if (error) return falhou('os impostos', error.message);
    }

    // 3. Remuneração dos sócios
    if (socios.length > 0) {
      const { error } = await supabase.from('remuneracao_socios').upsert(
        socios.map((s) => ({
          lancamento_id: lancamentoId,
          socio_id: s.id,
          pro_labore: (remuneracao[s.id]?.proLabore ?? 0) / 100,
          distribuicao_lucros: (remuneracao[s.id]?.distribuicao ?? 0) / 100,
        })),
        { onConflict: 'lancamento_id,socio_id' },
      );
      if (error) return falhou('a remuneração dos sócios', error.message);
    }

    // 4. Ações realizadas no mês
    {
      const { error } = await supabase.from('acoes_mes').delete().eq('lancamento_id', lancamentoId);
      if (error) return falhou('as ações do mês', error.message);
    }
    const linhasAcoes = acoes
      .filter((a) => a.titulo.trim())
      .map((a, i) => ({ lancamento_id: lancamentoId, titulo: a.titulo.trim(), descricao: a.descricao.trim(), ordem: i + 1 }));
    if (linhasAcoes.length > 0) {
      const { error } = await supabase.from('acoes_mes').insert(linhasAcoes);
      if (error) return falhou('as ações do mês', error.message);
    }

    setSucesso(existente ? 'Lançamento atualizado com sucesso.' : 'Lançamento salvo com sucesso.');
    setMes(mesAtual());
    await carregarLancamentos();
    onAtualizado?.();
    setSalvando(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 md:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-lancamentos"
        className="relative w-full max-w-4xl rounded-2xl bg-[#0d1322] border border-[#d8b362]/40 shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="titulo-lancamentos" className="text-xl font-semibold text-[#d8b362]">
              Lançar Dados
            </h2>
            <p className="text-sm text-slate-400">
              {empresa.nome_empresa || 'Sem nome'} · {rotuloRegime(empresa.regime_tributario)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-slate-400 hover:text-white text-2xl leading-none px-2"
          >
            &times;
          </button>
        </div>

        <form onSubmit={salvar} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="mes" className={labelClasses}>
              Mês de Competência
            </label>
            <input
              id="mes"
              type="month"
              required
              value={mes}
              onChange={(e) => {
                setMes(e.target.value);
                setSucesso(null);
              }}
              className={`${inputClasses} sm:max-w-xs`}
            />
            {existente && (
              <p className="mt-2 text-sm text-amber-300">
                Já existe um lançamento para {formatarMes(mes)}. Ao salvar, ele será atualizado.
              </p>
            )}
          </div>

          <Secao titulo="Faturamento e Notas Fiscais">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoMoeda id="faturamento" rotulo="Faturamento da Competência (R$)" centavos={faturamento} onChange={setFaturamento} />
              <div className="hidden sm:block" />
              <div>
                <label htmlFor="nfeQtd" className={labelClasses}>NF-e (Produto) — quantidade</label>
                <input id="nfeQtd" type="number" min={0} value={nfeQtd} onChange={(e) => setNfeQtd(e.target.value)} className={inputClasses} />
              </div>
              <CampoMoeda id="nfeValor" rotulo="NF-e (Produto) — valor (R$)" centavos={nfeValor} onChange={setNfeValor} />
              <div>
                <label htmlFor="nfseQtd" className={labelClasses}>NFS-e (Serviço) — quantidade</label>
                <input id="nfseQtd" type="number" min={0} value={nfseQtd} onChange={(e) => setNfseQtd(e.target.value)} className={inputClasses} />
              </div>
              <CampoMoeda id="nfseValor" rotulo="NFS-e (Serviço) — valor (R$)" centavos={nfseValor} onChange={setNfseValor} />
            </div>
            {somaNfs > 0 && somaNfs !== faturamento && (
              <p className="mt-3 text-sm text-amber-300">
                A soma das NFs ({formatarCentavos(somaNfs)}) é diferente do faturamento ({formatarCentavos(faturamento)}).
              </p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Total de NFs escrituradas: {(parseInt(nfeQtd, 10) || 0) + (parseInt(nfseQtd, 10) || 0)}
            </p>
          </Secao>

          <Secao titulo="Impostos Apurados">
            {!empresa.regime_tributario ? (
              <p className="text-sm text-amber-300">Esta empresa não tem regime tributário cadastrado.</p>
            ) : (
              <>
                <div className="grid gap-5">
                  {impostosAtivos.map((i) => {
                    const bloqueado = i.periodicidade === 'trimestral' && !trimestreAberto;
                    return (
                      <div key={i.tipo_imposto_id}>
                        <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
                          <CampoMoeda
                            id={`imposto-${i.codigo}`}
                            rotulo={`${i.nome}${i.periodicidade === 'trimestral' ? ' (trimestral)' : ''}`}
                            centavos={valorEfetivo(i)}
                            disabled={bloqueado}
                            onChange={(c) => setValoresImposto((prev) => ({ ...prev, [i.tipo_imposto_id]: c }))}
                            dica={
                              bloqueado
                                ? 'Lançado apenas em mar, jun, set e dez.'
                                : DICAS_IMPOSTO[i.codigo]
                            }
                          />
                          <div>
                            <label htmlFor={`aliquota-${i.codigo}`} className={labelClasses}>
                              Alíquota {i.codigo} (%)
                            </label>
                            <input
                              id={`aliquota-${i.codigo}`}
                              type="text"
                              inputMode="decimal"
                              disabled={bloqueado}
                              value={aliquotas[i.tipo_imposto_id] ?? ''}
                              onChange={(e) =>
                                setAliquotas((prev) => ({
                                  ...prev,
                                  [i.tipo_imposto_id]: e.target.value.replace(/[^\d.,]/g, ''),
                                }))
                              }
                              placeholder="Ex.: 0,65"
                              className={inputClasses}
                            />
                          </div>
                        </div>
                        {!i.sugerido && (
                          <button
                            type="button"
                            onClick={() => {
                              setExtras((prev) => prev.filter((id) => id !== i.tipo_imposto_id));
                              setValoresImposto((prev) => ({ ...prev, [i.tipo_imposto_id]: 0 }));
                            }}
                            className="mt-1 text-xs text-slate-400 hover:text-red-300"
                          >
                            Remover {i.codigo}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {impostosDisponiveis.length > 0 && (
                  <div className="mt-4 sm:max-w-xs">
                    <label htmlFor="addImposto" className={labelClasses}>+ Adicionar imposto</label>
                    <select
                      id="addImposto"
                      value=""
                      onChange={(e) => e.target.value && setExtras((prev) => [...prev, e.target.value])}
                      className={inputClasses}
                    >
                      <option value="">Selecione...</option>
                      {impostosDisponiveis.map((i) => (
                        <option key={i.tipo_imposto_id} value={i.tipo_imposto_id}>{i.nome}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <span className="block text-xs text-slate-400">Total de impostos</span>
                    <span className="font-semibold text-white">{formatarCentavos(totalImpostos)}</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <span className="block text-xs text-slate-400">Carga tributária efetiva</span>
                    <span className="font-semibold text-white">{pct.format(carga)}%</span>
                  </div>
                </div>
              </>
            )}
          </Secao>

          <Secao titulo="Planejamento e Economia Tributária">
            <div className="grid gap-4 sm:grid-cols-3">
              <CampoMoeda id="cenario" rotulo="Cenário sem otimização (R$)" centavos={cenario} onChange={setCenario} />
              <div>
                <span className={labelClasses}>Com otimização Private</span>
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold text-emerald-300">
                  {formatarCentavos(totalImpostos)}
                </div>
              </div>
              <div>
                <span className={labelClasses}>Economia do mês</span>
                <div
                  className={`rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold ${
                    economia < 0 ? 'text-red-300' : 'text-[#d8b362]'
                  }`}
                >
                  {cenario > 0 ? formatarCentavos(economia) : '—'}
                </div>
              </div>
            </div>
          </Secao>

          <Secao titulo="Remuneração dos Sócios">
            {socios.length === 0 ? (
              <p className="text-sm text-slate-400">Esta empresa não tem sócios cadastrados.</p>
            ) : (
              <div className="grid gap-4">
                {socios.map((s, i) => (
                  <div key={s.id} className="grid gap-4 sm:grid-cols-[1.2fr_1fr_1fr] sm:items-end">
                    <div>
                      <span className="block text-sm font-medium text-white">{s.nome}</span>
                      <span className="text-xs text-slate-400">
                        Sócio {String(i + 1).padStart(2, '0')} · {pct.format(Number(s.cota_percentual))}% de cota
                      </span>
                    </div>
                    <CampoMoeda
                      id={`pro-${s.id}`}
                      rotulo="Pró-labore do mês (R$)"
                      centavos={remuneracao[s.id]?.proLabore ?? 0}
                      onChange={(c) => setRem(s.id, 'proLabore', c)}
                    />
                    <CampoMoeda
                      id={`dist-${s.id}`}
                      rotulo="Distribuição de lucros (R$)"
                      centavos={remuneracao[s.id]?.distribuicao ?? 0}
                      onChange={(c) => setRem(s.id, 'distribuicao', c)}
                    />
                  </div>
                ))}
              </div>
            )}
          </Secao>

          <Secao titulo="Ações Realizadas no Mês">
            <div className="grid gap-3">
              {acoes.map((a, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-white/10 bg-white/5 p-3">
                  <input
                    type="text"
                    aria-label={`Título da ação ${i + 1}`}
                    value={a.titulo}
                    onChange={(e) => setAcoes((prev) => prev.map((x, j) => (j === i ? { ...x, titulo: e.target.value } : x)))}
                    placeholder="Título (ex.: Revisão do Regime Tributário)"
                    className={inputClasses}
                  />
                  <textarea
                    aria-label={`Descrição da ação ${i + 1}`}
                    rows={2}
                    value={a.descricao}
                    onChange={(e) => setAcoes((prev) => prev.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
                    placeholder="Descrição"
                    className={inputClasses}
                  />
                  <button
                    type="button"
                    onClick={() => setAcoes((prev) => prev.filter((_, j) => j !== i))}
                    className="justify-self-start text-xs text-slate-400 hover:text-red-300"
                  >
                    Remover ação
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setAcoes((prev) => [...prev, { titulo: '', descricao: '' }])}
                className={`${ghostButtonClasses} justify-self-start px-3 py-1.5 rounded-lg text-sm`}
              >
                + Adicionar ação
              </button>
            </div>
          </Secao>

          <div className="sm:col-span-2 flex items-center gap-3">
            <button type="submit" disabled={salvando} className={`${goldButtonClasses} px-5 py-2 rounded-lg`}>
              {salvando ? 'Salvando...' : existente ? 'Atualizar' : 'Salvar Lançamento'}
            </button>
            <button type="button" onClick={onClose} className={`${ghostButtonClasses} px-4 py-2 rounded-lg`}>
              Fechar
            </button>
          </div>
        </form>

        {sucesso && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-sm">
            {sucesso}
          </div>
        )}
        {erro && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-sm">
            {erro}
          </div>
        )}

        <h3 className="text-sm font-semibold text-[#d8b362] mt-6 mb-2">Histórico de lançamentos</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#d8b362]/20 text-slate-400">
                <th className="py-2 px-3 font-medium">Mês</th>
                <th className="py-2 px-3 font-medium text-right">Faturamento</th>
                <th className="py-2 px-3 font-medium text-right">Impostos</th>
                <th className="py-2 px-3 font-medium text-right">Carga</th>
                <th className="py-2 px-3 font-medium text-right">Economia</th>
                <th className="py-2 px-3 font-medium text-right">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    Carregando...
                  </td>
                </tr>
              ) : lancamentos.length > 0 ? (
                lancamentos.map((l) => {
                  const impostos = totaisImpostos[l.id] ?? 0;
                  const fat = Number(l.faturamento);
                  const eco = Number(l.cenario_sem_otimizacao) - impostos;
                  return (
                    <tr key={l.id} className="border-b border-white/5">
                      <td className="py-2 px-3 text-white">{formatarMes(l.mes_referencia)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{brl.format(fat)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">{brl.format(impostos)}</td>
                      <td className="py-2 px-3 text-right text-slate-300">
                        {fat > 0 ? `${pct.format((impostos / fat) * 100)}%` : '—'}
                      </td>
                      <td className="py-2 px-3 text-right text-[#d8b362]">
                        {Number(l.cenario_sem_otimizacao) > 0 ? brl.format(eco) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setMes(l.mes_referencia);
                            setSucesso(null);
                          }}
                          className="text-xs text-[#d8b362] hover:underline"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500">
                    Nenhum lançamento para esta empresa ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
