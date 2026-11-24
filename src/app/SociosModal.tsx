'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { mascararCpf } from '../lib/formatacao';
import { goldButtonClasses, ghostButtonClasses, inputClasses, labelClasses } from '../lib/estilos';

type EmpresaModal = { id: string | number; nome_empresa: string | null };

// id presente = sócio já existe (edita por UPDATE); ausente = recém-adicionado nesta sessão
// (vira INSERT ao salvar). Sócios existentes não podem ser removidos por aqui: eles podem
// estar referenciados em lançamentos antigos (Distribuição de Lucros), então remover um
// sócio de verdade precisa ser feito direto no banco, com cuidado.
type SocioForm = { id?: string; nome: string; cota: string; cpf: string };

const cotaEmCentesimos = (cota: string) => Math.round((parseFloat(cota.replace(',', '.')) || 0) * 100);

export default function SociosModal({
  empresa,
  onClose,
  onAtualizado,
}: {
  empresa: EmpresaModal;
  onClose: () => void;
  onAtualizado?: () => void;
}) {
  const [socios, setSocios] = useState<SocioForm[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data, error } = await supabase
      .from('socios')
      .select('id, nome, cota_percentual, cpf')
      .eq('empresa_id', empresa.id)
      .order('ordem');

    if (error) {
      setErro(`Erro ao carregar sócios: ${error.message}`);
    } else {
      setSocios(
        (data ?? []).map((s) => ({
          id: s.id,
          nome: s.nome,
          cota: String(Number(s.cota_percentual)).replace('.', ','),
          cpf: mascararCpf(s.cpf ?? ''),
        })),
      );
    }
    setCarregando(false);
  }, [empresa.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onClose]);

  function alterarSocio(indice: number, campo: keyof SocioForm, valor: string) {
    setSocios((prev) => prev.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s)));
  }

  const somaCotas = socios.reduce((total, s) => total + cotaEmCentesimos(s.cota), 0);
  const cotasOk = somaCotas === 10000;

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    setSucesso(null);

    if (socios.some((s) => !s.nome.trim() || cotaEmCentesimos(s.cota) <= 0)) {
      setErro('Preencha o nome e a cota (%) de cada sócio.');
      return;
    }
    if (!cotasOk) {
      setErro(`A soma das cotas deve ser 100%. Hoje está em ${(somaCotas / 100).toLocaleString('pt-BR')}%.`);
      return;
    }

    setSalvando(true);

    const existentes = socios.filter((s) => s.id);
    const novos = socios.filter((s) => !s.id);

    for (const s of existentes) {
      const { error } = await supabase
        .from('socios')
        .update({
          nome: s.nome.trim(),
          cota_percentual: cotaEmCentesimos(s.cota) / 100,
          cpf: s.cpf.replace(/\D/g, '') || null,
        })
        .eq('id', s.id);
      if (error) {
        setErro(`Erro ao atualizar ${s.nome}: ${error.message}`);
        setSalvando(false);
        return;
      }
    }

    if (novos.length > 0) {
      const { error } = await supabase.from('socios').insert(
        novos.map((s, i) => ({
          empresa_id: empresa.id,
          nome: s.nome.trim(),
          cota_percentual: cotaEmCentesimos(s.cota) / 100,
          cpf: s.cpf.replace(/\D/g, '') || null,
          ordem: existentes.length + i + 1,
        })),
      );
      if (error) {
        setErro(`Erro ao adicionar sócio: ${error.message}`);
        setSalvando(false);
        return;
      }
    }

    setSucesso('Sócios atualizados com sucesso.');
    setSalvando(false);
    await carregar();
    onAtualizado?.();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 md:p-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-socios"
        className="relative w-full max-w-2xl rounded-2xl bg-[#0d1322] border border-[#d8b362]/40 shadow-2xl shadow-black/50 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h2 id="titulo-socios" className="text-xl font-semibold text-[#d8b362]">
              Sócios
            </h2>
            <p className="text-sm text-slate-400">{empresa.nome_empresa || 'Sem nome'}</p>
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

        {carregando ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (
          <form onSubmit={salvar} className="grid gap-4">
            {erro && <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-sm">{erro}</div>}
            {sucesso && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-sm">
                {sucesso}
              </div>
            )}

            <div className={`text-sm font-semibold ${cotasOk ? 'text-emerald-300' : 'text-amber-300'}`}>
              Soma das cotas: {(somaCotas / 100).toLocaleString('pt-BR')}% {cotasOk ? '✓' : '(deve ser 100%)'}
            </div>

            <div className="grid gap-3">
              {socios.map((s, i) => (
                <div key={s.id ?? `novo-${i}`} className="grid gap-3 sm:grid-cols-[2.4fr_1fr_1.6fr]">
                  <div>
                    <label htmlFor={`socio-nome-${i}`} className={labelClasses}>
                      Sócio {String(i + 1).padStart(2, '0')}
                    </label>
                    <input
                      id={`socio-nome-${i}`}
                      type="text"
                      required
                      value={s.nome}
                      onChange={(e) => alterarSocio(i, 'nome', e.target.value)}
                      placeholder="Nome completo"
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label htmlFor={`socio-cota-${i}`} className={labelClasses}>Cota (%)</label>
                    <input
                      id={`socio-cota-${i}`}
                      type="text"
                      inputMode="decimal"
                      required
                      value={s.cota}
                      onChange={(e) => alterarSocio(i, 'cota', e.target.value.replace(/[^\d.,]/g, ''))}
                      className={inputClasses}
                    />
                  </div>
                  <div>
                    <label htmlFor={`socio-cpf-${i}`} className={labelClasses}>CPF</label>
                    <input
                      id={`socio-cpf-${i}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={14}
                      value={s.cpf}
                      onChange={(e) => alterarSocio(i, 'cpf', mascararCpf(e.target.value))}
                      placeholder="000.000.000-00"
                      className={inputClasses}
                    />
                  </div>
                  {!s.id && (
                    <button
                      type="button"
                      onClick={() => setSocios((prev) => prev.filter((_, j) => j !== i))}
                      className="justify-self-start text-xs text-slate-400 hover:text-red-300 sm:col-span-3"
                    >
                      Remover
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setSocios((prev) => [...prev, { nome: '', cota: '', cpf: '' }])}
              className={`${ghostButtonClasses} justify-self-start px-3 py-1.5 rounded-lg text-sm`}
            >
              + Adicionar sócio
            </button>

            <p className="text-xs text-slate-500">
              O CPF é usado só para puxar automaticamente o vencimento do certificado digital (e-CPF) do sócio no
              relatório do cliente. Sócios já existentes não podem ser removidos por aqui — eles podem ter
              lançamentos antigos vinculados.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={onClose} className={`${ghostButtonClasses} px-4 py-2 rounded-lg`}>
                Fechar
              </button>
              <button type="submit" disabled={salvando} className={`${goldButtonClasses} px-6 py-2 rounded-lg`}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
