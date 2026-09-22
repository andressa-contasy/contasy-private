'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import { rotuloPorte, rotuloRegime } from '../lib/formatacao';
import { cardClasses, ghostButtonClasses, goldButtonClasses } from '../lib/estilos';
import CadastroEmpresaForm from './CadastroEmpresaForm';
import LancamentosModal from './LancamentosModal';
import ContaBotoes from './ContaBotoes';

type Empresa = {
  id: string | number;
  nome_empresa: string | null;
  cnpj: string | null;
  regime_tributario: string | null;
  porte: string | null;
};

export default function DashboardPage() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [empresaLancamentos, setEmpresaLancamentos] = useState<Empresa | null>(null);

  // Busca a lista de empresas cadastradas no Supabase
  const carregarEmpresas = useCallback(async () => {
    const { data, error } = await supabase.from('empresas').select('*');

    if (error) {
      setErro(`Erro ao carregar dados do Supabase: ${error.message}`);
    } else {
      setErro(null);
      setEmpresas(data ?? []);
    }
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#020617] text-slate-200 p-8">
      {/* Marca d'água ao fundo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5"
      >
        <Image
          src="/logo-contasy-private.png"
          alt=""
          width={800}
          height={800}
          className="w-[min(80vw,800px)] h-auto select-none"
        />
      </div>

      <div className="relative max-w-6xl mx-auto">
        <header className="flex items-center gap-4 mb-8 pb-4 border-b border-[#d8b362]/20">
          <Image
            src="/logo-contasy-private.png"
            alt="Contasy Private"
            width={56}
            height={56}
            priority
            className="rounded-xl"
          />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-wide text-white">CONTASY</h1>
              <span className="text-[#d8b362] bg-[#d8b362]/20 border border-[#d8b362]/40 rounded px-2 py-0.5 text-xs font-bold">
                PRIVATE
              </span>
            </div>
            <p className="text-slate-400 text-sm">Inteligência &amp; Gestão Estratégica</p>
          </div>
          <div className="ml-auto">
            <ContaBotoes />
          </div>
        </header>

        <CadastroEmpresaForm onCadastrada={carregarEmpresas} />

        <section className={`${cardClasses} p-6`}>
          <h2 className="text-xl font-semibold text-[#d8b362] mb-4">Empresas Cadastradas</h2>

          {erro && (
            <div className="p-4 mb-4 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-sm">{erro}</div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#d8b362]/20 text-[#d8b362] text-sm">
                  <th className="py-3 px-4 font-semibold">Nome / Razão Social</th>
                  <th className="py-3 px-4 font-semibold">CNPJ / ID</th>
                  <th className="py-3 px-4 font-semibold">Regime</th>
                  <th className="py-3 px-4 font-semibold">Porte</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      Carregando...
                    </td>
                  </tr>
                ) : empresas.length > 0 ? (
                  empresas.map((empresa) => (
                    <tr key={empresa.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="py-3 px-4 font-medium text-white">{empresa.nome_empresa || 'Sem nome'}</td>
                      <td className="py-3 px-4 text-slate-300">{empresa.cnpj || empresa.id}</td>
                      <td className="py-3 px-4 text-slate-300">{rotuloRegime(empresa.regime_tributario)}</td>
                      <td className="py-3 px-4 text-slate-300">{rotuloPorte(empresa.porte)}</td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-1 text-xs font-semibold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 rounded-full">
                          Ativo
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <Link
                          href={`/painel/${empresa.id}`}
                          className={`${ghostButtonClasses} inline-block text-sm px-3 py-1.5 rounded-lg mr-2`}
                        >
                          Consultar
                        </Link>
                        <button
                          type="button"
                          onClick={() => setEmpresaLancamentos(empresa)}
                          className={`${goldButtonClasses} text-sm px-3 py-1.5 rounded-lg`}
                        >
                          Lançar Dados
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      Nenhuma empresa cadastrada ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {empresaLancamentos && (
        <LancamentosModal
          empresa={empresaLancamentos}
          onClose={() => setEmpresaLancamentos(null)}
        />
      )}
    </main>
  );
}
