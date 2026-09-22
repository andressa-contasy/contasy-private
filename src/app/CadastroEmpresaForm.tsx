'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PORTES, REGIMES } from '../lib/formatacao';
import { cardClasses, ghostButtonClasses, goldButtonClasses, inputClasses, labelClasses } from '../lib/estilos';

type Contador = { id: string; nome: string; crc: string };
type SocioForm = { nome: string; cota: string };

// Aplica a máscara XX.XXX.XXX/XXXX-XX enquanto o usuário digita.
// CNPJ alfanumérico: as 12 primeiras posições aceitam letras e números,
// os 2 dígitos verificadores finais são sempre numéricos.
function mascararCnpj(valor: string) {
  const limpo = valor.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  const d = limpo.slice(0, 12) + limpo.slice(12).replace(/\D/g, '');

  let r = d.slice(0, 2);
  if (d.length > 2) r += '.' + d.slice(2, 5);
  if (d.length > 5) r += '.' + d.slice(5, 8);
  if (d.length > 8) r += '/' + d.slice(8, 12);
  if (d.length > 12) r += '-' + d.slice(12, 14);
  return r;
}

const cotaEmCentesimos = (cota: string) => Math.round((parseFloat(cota.replace(',', '.')) || 0) * 100);

export default function CadastroEmpresaForm({ onCadastrada }: { onCadastrada: () => Promise<void> | void }) {
  const [nome, setNome] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [regime, setRegime] = useState('');
  const [regimeAnterior, setRegimeAnterior] = useState('');
  const [porte, setPorte] = useState('');

  const [contadores, setContadores] = useState<Contador[]>([]);
  const [contadorId, setContadorId] = useState('');
  const [novoContadorAberto, setNovoContadorAberto] = useState(false);
  const [novoContadorNome, setNovoContadorNome] = useState('');
  const [novoContadorCrc, setNovoContadorCrc] = useState('');
  const [salvandoContador, setSalvandoContador] = useState(false);

  const [qtdTexto, setQtdTexto] = useState('1');
  const [socios, setSocios] = useState<SocioForm[]>([{ nome: '', cota: '100' }]);

  const [aberto, setAberto] = useState(false); // recolhido por padrão
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const carregarContadores = useCallback(async (selecionar?: string) => {
    const { data, error } = await supabase
      .from('contadores')
      .select('id, nome, crc')
      .eq('ativo', true)
      .order('nome');

    if (error) {
      setErro(`Erro ao carregar contadores: ${error.message}`);
      return;
    }
    const lista: Contador[] = data ?? [];
    setContadores(lista);
    // Pré-seleciona o novo contador ou, se nada estiver escolhido, o primeiro da lista
    setContadorId((atual) => selecionar ?? (atual || lista[0]?.id || ''));
  }, []);

  useEffect(() => {
    carregarContadores();
  }, [carregarContadores]);

  function alterarQuantidade(texto: string) {
    setQtdTexto(texto);
    const n = parseInt(texto, 10);
    if (!Number.isInteger(n) || n < 1 || n > 20) return;
    setSocios((prev) =>
      Array.from({ length: n }, (_, i) => prev[i] ?? { nome: '', cota: n === 1 ? '100' : '' }),
    );
  }

  function alterarSocio(indice: number, campo: keyof SocioForm, valor: string) {
    setSocios((prev) => prev.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s)));
  }

  const somaCotas = socios.reduce((total, s) => total + cotaEmCentesimos(s.cota), 0);
  const cotasOk = somaCotas === 10000;

  function fecharNovoContador() {
    setNovoContadorAberto(false);
    setNovoContadorNome('');
    setNovoContadorCrc('');
    setErro(null);
  }

  async function cadastrarContador() {
    if (!novoContadorNome.trim() || !novoContadorCrc.trim()) {
      setErro('Informe o nome e o CRC do contador.');
      return;
    }
    setSalvandoContador(true);
    setErro(null);
    const { data, error } = await supabase
      .from('contadores')
      .insert({ nome: novoContadorNome.trim(), crc: novoContadorCrc.trim() })
      .select('id')
      .single();

    if (error) {
      setErro(`Erro ao cadastrar contador: ${error.message}`);
    } else {
      setNovoContadorNome('');
      setNovoContadorCrc('');
      setNovoContadorAberto(false);
      await carregarContadores(data.id);
    }
    setSalvandoContador(false);
  }

  async function cadastrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSucesso(false);
    setErro(null);

    if (cnpj.length !== 18) {
      setErro('CNPJ incompleto. Informe os 14 caracteres.');
      return;
    }
    if (porte === 'mei' && regime !== 'simples_nacional') {
      setErro('Empresas MEI pertencem ao Simples Nacional.');
      return;
    }
    if (socios.some((s) => cotaEmCentesimos(s.cota) <= 0)) {
      setErro('Informe a cota (%) de cada sócio.');
      return;
    }
    if (!cotasOk) {
      setErro(`A soma das cotas deve ser 100%. Hoje está em ${(somaCotas / 100).toLocaleString('pt-BR')}%.`);
      return;
    }

    setSalvando(true);

    const { data: empresa, error: erroEmpresa } = await supabase
      .from('empresas')
      .insert({
        nome_empresa: nome.trim(),
        cnpj,
        regime_tributario: regime,
        regime_anterior: regimeAnterior || null,
        porte,
        contador_id: contadorId,
      })
      .select('id')
      .single();

    if (erroEmpresa) {
      setErro(`Erro ao cadastrar empresa: ${erroEmpresa.message}`);
      setSalvando(false);
      return;
    }

    const { error: erroSocios } = await supabase.from('socios').insert(
      socios.map((s, i) => ({
        empresa_id: empresa.id,
        nome: s.nome.trim(),
        cota_percentual: cotaEmCentesimos(s.cota) / 100,
        ordem: i + 1,
      })),
    );

    if (erroSocios) {
      // Desfaz o cadastro da empresa para não ficar uma empresa sem sócios
      await supabase.from('empresas').delete().eq('id', empresa.id);
      setErro(`Erro ao cadastrar sócios: ${erroSocios.message}`);
      setSalvando(false);
      return;
    }

    setNome('');
    setCnpj('');
    setRegime('');
    setRegimeAnterior('');
    setPorte('');
    setQtdTexto('1');
    setSocios([{ nome: '', cota: '100' }]);
    setSucesso(true);
    setAberto(false); // recolhe o formulário e deixa só a confirmação visível
    setSalvando(false);
    await onCadastrada();
  }

  return (
    <section className={`${cardClasses} p-6 mb-8`}>
      <h2 className="text-xl font-semibold text-[#d8b362]">
        <button
          type="button"
          onClick={() => {
            setAberto((atual) => !atual);
            setSucesso(false);
          }}
          aria-expanded={aberto}
          aria-controls="form-cadastro-empresa"
          className="flex w-full items-center justify-between gap-4 text-left"
        >
          Cadastrar Empresa
          <ChevronDown size={22} className={`flex-none transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </h2>

      {sucesso && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-lg text-sm">
          Empresa cadastrada com sucesso.
        </div>
      )}

      <div id="form-cadastro-empresa" hidden={!aberto} className="mt-4">
      <form onSubmit={cadastrar} className="grid gap-4 md:grid-cols-6">
        <div className="md:col-span-4">
          <label htmlFor="nome" className={labelClasses}>Nome / Razão Social</label>
          <input
            id="nome"
            type="text"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Contasy Ltda"
            className={inputClasses}
          />
        </div>
        <div className="md:col-span-2">
          <label htmlFor="cnpj" className={labelClasses}>CNPJ</label>
          <input
            id="cnpj"
            type="text"
            required
            autoCapitalize="characters"
            maxLength={18}
            value={cnpj}
            onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
            placeholder="00.000.000/0000-00"
            className={inputClasses}
          />
        </div>

        <div className="md:col-span-2">
          <label htmlFor="regime" className={labelClasses}>Regime Tributário</label>
          <select id="regime" required value={regime} onChange={(e) => setRegime(e.target.value)} className={inputClasses}>
            <option value="">Selecione...</option>
            {Object.entries(REGIMES).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="regimeAnterior" className={labelClasses}>Regime Anterior (opcional)</label>
          <select
            id="regimeAnterior"
            value={regimeAnterior}
            onChange={(e) => setRegimeAnterior(e.target.value)}
            className={inputClasses}
          >
            <option value="">Não informado</option>
            {Object.entries(REGIMES).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label htmlFor="porte" className={labelClasses}>Porte</label>
          <select id="porte" required value={porte} onChange={(e) => setPorte(e.target.value)} className={inputClasses}>
            <option value="">Selecione...</option>
            {Object.entries(PORTES).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>{rotulo}</option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <label htmlFor="contador" className={labelClasses}>Contador Responsável</label>
          <select
            id="contador"
            required
            value={contadorId}
            onChange={(e) => setContadorId(e.target.value)}
            className={inputClasses}
          >
            {contadores.length === 0 && <option value="">Nenhum contador cadastrado</option>}
            {contadores.map((c) => (
              <option key={c.id} value={c.id}>{c.nome} — {c.crc}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 md:self-end">
          <button
            type="button"
            onClick={() => (novoContadorAberto ? fecharNovoContador() : setNovoContadorAberto(true))}
            className={`${ghostButtonClasses} w-full px-4 py-2 rounded-lg text-sm`}
          >
            {novoContadorAberto ? 'Fechar' : '+ Novo contador'}
          </button>
        </div>

        {novoContadorAberto && (
          <div className="relative md:col-span-6 grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end rounded-xl border border-[#d8b362]/20 bg-white/5 p-4 pt-8">
            <button
              type="button"
              onClick={fecharNovoContador}
              aria-label="Fechar novo contador"
              className="absolute right-3 top-2 text-xl leading-none text-slate-400 hover:text-white"
            >
              &times;
            </button>
            <div>
              <label htmlFor="novoContadorNome" className={labelClasses}>Nome do contador</label>
              <input
                id="novoContadorNome"
                type="text"
                value={novoContadorNome}
                onChange={(e) => setNovoContadorNome(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="novoContadorCrc" className={labelClasses}>CRC</label>
              <input
                id="novoContadorCrc"
                type="text"
                value={novoContadorCrc}
                onChange={(e) => setNovoContadorCrc(e.target.value)}
                placeholder="CRC-UF 000000/O"
                className={inputClasses}
              />
            </div>
            <button
              type="button"
              onClick={cadastrarContador}
              disabled={salvandoContador}
              className={`${goldButtonClasses} px-4 py-2 rounded-lg`}
            >
              {salvandoContador ? 'Salvando...' : 'Salvar contador'}
            </button>
          </div>
        )}

        <div className="md:col-span-6 border-t border-[#d8b362]/20 pt-4">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-3">
            <div>
              <label htmlFor="qtdSocios" className={labelClasses}>Quantidade de Sócios</label>
              <input
                id="qtdSocios"
                type="number"
                min={1}
                max={20}
                value={qtdTexto}
                onChange={(e) => alterarQuantidade(e.target.value)}
                className={`${inputClasses} w-28`}
              />
            </div>
            <div className={`text-sm font-semibold ${cotasOk ? 'text-emerald-300' : 'text-amber-300'}`}>
              Soma das cotas: {(somaCotas / 100).toLocaleString('pt-BR')}% {cotasOk ? '✓' : '(deve ser 100%)'}
            </div>
          </div>

          <div className="grid gap-3">
            {socios.map((s, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-[3fr_1fr]">
                <div>
                  <label htmlFor={`socio-nome-${i}`} className={labelClasses}>Sócio {String(i + 1).padStart(2, '0')}</label>
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
                    placeholder="50"
                    className={inputClasses}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="md:col-span-6">
          <button type="submit" disabled={salvando} className={`${goldButtonClasses} px-6 py-2 rounded-lg`}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </form>

      {erro && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg text-sm">{erro}</div>
      )}
      </div>
    </section>
  );
}
