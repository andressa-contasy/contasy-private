'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { brl, pct, somarAliquotas } from '../../../lib/formatacao';
import { calcularPainel, carregarDados, contarMeses, deslocarMes, rotuloMes } from '../../../lib/painel';
import type { DadosEmpresa } from '../../../lib/painel';
import { goldButtonClasses, ghostButtonClasses } from '../../../lib/estilos';
import LancamentosModal from '../../LancamentosModal';
import ContaBotoes from '../../ContaBotoes';
import PainelCliente from '../PainelCliente';
import styles from '../painel.module.css';

type Aba = 'painel' | 'historico';

const slugify = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'empresa';

const moeda = (centavos: number) => brl.format(centavos / 100);

// Espera o navegador desenhar as mudanças de tela antes de capturar
const aguardarRender = () =>
  new Promise<void>((resolver) => requestAnimationFrame(() => requestAnimationFrame(() => resolver())));

export default function ConsultaEmpresaPage() {
  const { id } = useParams<{ id: string }>();
  const painelRef = useRef<HTMLDivElement>(null);

  const [dados, setDados] = useState<DadosEmpresa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [aba, setAba] = useState<Aba>('painel');
  const [modo, setModo] = useState(''); // 'AAAA-MM' | 'trimestre' | 'ano' | 'personalizado'
  const [personalizadoDe, setPersonalizadoDe] = useState('');
  const [personalizadoAte, setPersonalizadoAte] = useState('');

  const [exportando, setExportando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [mesModal, setMesModal] = useState<string | undefined>(undefined);

  const recarregar = useCallback(async () => {
    try {
      const carregados = await carregarDados(id);
      setDados(carregados);
      setErro(null);
      // Primeira carga: abre no mês mais recente com lançamento
      setModo((atual) => atual || carregados.lancamentos.at(-1)?.mes || '');
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const mesesDisponiveis = useMemo(() => (dados ? dados.lancamentos.map((l) => l.mes).reverse() : []), [dados]);
  const maisRecente = mesesDisponiveis[0];

  // Período efetivo (de, ate) a partir da seleção
  const periodo = useMemo(() => {
    if (!maisRecente) return null;
    if (modo === 'trimestre') return { de: deslocarMes(maisRecente, -2), ate: maisRecente };
    if (modo === 'ano') return { de: `${maisRecente.slice(0, 4)}-01`, ate: maisRecente };
    if (modo === 'personalizado') {
      const a = personalizadoDe || maisRecente;
      const b = personalizadoAte || maisRecente;
      return a <= b ? { de: a, ate: b } : { de: b, ate: a };
    }
    return { de: modo || maisRecente, ate: modo || maisRecente };
  }, [modo, maisRecente, personalizadoDe, personalizadoAte]);

  const resultado = useMemo(
    () => (dados && periodo ? calcularPainel(dados, periodo.de, periodo.ate) : null),
    [dados, periodo],
  );

  const textoPeriodo = periodo
    ? periodo.de === periodo.ate
      ? rotuloMes(periodo.de)
      : `${rotuloMes(periodo.de)} a ${rotuloMes(periodo.ate)}`
    : '';

  function escolherModo(valor: string) {
    setModo(valor);
    if (valor === 'personalizado') {
      setPersonalizadoDe((atual) => atual || maisRecente || '');
      setPersonalizadoAte((atual) => atual || maisRecente || '');
    }
  }

  async function exportarPdf() {
    if (!dados || !periodo || !painelRef.current) return;
    setErro(null);
    setExportando(true);
    try {
      // Troca o seletor por texto fixo e trava a largura, para o PDF sair igual ao painel
      await aguardarRender();
      await document.fonts.ready;

      // Imports dinâmicos: só funcionam no navegador
      const [{ toJpeg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
      const elemento = painelRef.current;
      const largura = elemento.offsetWidth;
      const altura = elemento.offsetHeight;
      const arquivo = `contasy-private-${slugify(dados.empresa.nome_empresa || 'empresa')}-${
        periodo.de === periodo.ate ? periodo.de : `${periodo.de}_a_${periodo.ate}`
      }.pdf`;

      // Captura com o próprio desenho do navegador (fiel ao painel, inclusive fontes e gráfico)
      const imagem = await toJpeg(elemento, {
        pixelRatio: 2,
        quality: 0.95,
        backgroundColor: '#050a18',
        width: largura,
        height: altura,
      });

      // Uma única página com o tamanho exato do painel (sem cortes no meio dos cartões)
      const pdf = new jsPDF({
        unit: 'px',
        format: [largura, altura],
        orientation: largura > altura ? 'landscape' : 'portrait',
        hotfixes: ['px_scaling'],
        compress: true,
      });
      pdf.addImage(imagem, 'JPEG', 0, 0, largura, altura);
      pdf.save(arquivo);
    } catch (e) {
      setErro(`Erro ao gerar o PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExportando(false);
    }
  }

  const seletor =
    dados && periodo ? (
      exportando ? (
        <>
          <span className={styles.seletorRotulo}>{periodo.de === periodo.ate ? 'Competência:' : 'Período:'}</span>
          <span className={styles.selectEstatico}>{textoPeriodo}</span>
        </>
      ) : (
        <>
          <label htmlFor="competencia" className={styles.seletorRotulo}>
            Selecione o mês de competência:
          </label>
          <select id="competencia" value={modo} onChange={(e) => escolherModo(e.target.value)} className={styles.select}>
            <optgroup label="Mês de competência">
              {mesesDisponiveis.map((m) => (
                <option key={m} value={m}>
                  {rotuloMes(m)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Períodos">
              <option value="trimestre">Último trimestre</option>
              <option value="ano">Ano {maisRecente?.slice(0, 4)} (acumulado)</option>
              <option value="personalizado">Período personalizado…</option>
            </optgroup>
          </select>
          {modo === 'personalizado' && (
            <div className={styles.periodoPersonalizado}>
              <span>De</span>
              <select
                aria-label="Mês inicial"
                value={personalizadoDe}
                onChange={(e) => setPersonalizadoDe(e.target.value)}
                className={styles.select}
              >
                {[...mesesDisponiveis].reverse().map((m) => (
                  <option key={m} value={m}>
                    {rotuloMes(m)}
                  </option>
                ))}
              </select>
              <span>até</span>
              <select
                aria-label="Mês final"
                value={personalizadoAte}
                onChange={(e) => setPersonalizadoAte(e.target.value)}
                className={styles.select}
              >
                {[...mesesDisponiveis].reverse().map((m) => (
                  <option key={m} value={m}>
                    {rotuloMes(m)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )
    ) : null;

  return (
    <main className="min-h-screen bg-[#020617] text-slate-200">
      {/* Barra interna do time: não entra no PDF */}
      <div className="border-b border-[#d8b362]/20 bg-[#0b1120] px-6 py-3">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-3">
          <Link href="/" className={`${ghostButtonClasses} inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm`}>
            <ArrowLeft size={16} /> Voltar
          </Link>
          <div className="mr-auto min-w-0">
            <div className="truncate font-semibold text-white">{dados?.empresa.nome_empresa ?? 'Consulta'}</div>
            <div className="text-xs text-slate-400">Consulta interna · Time Private</div>
          </div>

          <div className="flex overflow-hidden rounded-lg border border-white/10 text-sm">
            {(['painel', 'historico'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setAba(item)}
                className={`px-4 py-1.5 transition ${
                  aba === item ? 'bg-[#d8b362]/20 font-semibold text-[#d8b362]' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                {item === 'painel' ? 'Painel' : 'Histórico'}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!dados}
            onClick={() => {
              setMesModal(undefined);
              setModalAberto(true);
            }}
            className={`${goldButtonClasses} rounded-lg px-3 py-1.5 text-sm`}
          >
            Lançar Dados
          </button>
          <button
            type="button"
            disabled={!resultado?.temDados || exportando || aba !== 'painel'}
            onClick={exportarPdf}
            className={`${goldButtonClasses} rounded-lg px-3 py-1.5 text-sm`}
          >
            {exportando ? 'Gerando PDF...' : 'Exportar PDF'}
          </button>
          <ContaBotoes />
        </div>
      </div>

      {erro && (
        <div className="mx-auto mt-4 max-w-[1240px] rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {erro}
        </div>
      )}

      {carregando && <p className="p-8 text-center text-slate-500">Carregando...</p>}

      {dados && dados.lancamentos.length === 0 && !carregando && (
        <div className="mx-auto mt-8 max-w-[640px] rounded-2xl border border-[#d8b362]/30 bg-[#0f172a]/80 p-8 text-center">
          <p className="text-lg font-semibold text-white">Nenhum lançamento para {dados.empresa.nome_empresa}.</p>
          <p className="mt-2 text-sm text-slate-400">Lance os dados do primeiro mês para montar o painel.</p>
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className={`${goldButtonClasses} mt-5 rounded-lg px-5 py-2`}
          >
            Lançar Dados
          </button>
        </div>
      )}

      {dados && resultado && dados.lancamentos.length > 0 && aba === 'painel' && (
        <div className="overflow-x-auto">
          <PainelCliente
            dados={dados}
            resultado={resultado}
            seletor={seletor}
            exportando={exportando}
            painelRef={painelRef}
          />
        </div>
      )}

      {dados && dados.lancamentos.length > 0 && aba === 'historico' && (
        <div className="mx-auto mt-6 max-w-[1240px] px-6 pb-12">
          <div className="rounded-2xl border border-[#d8b362]/30 bg-[#0f172a]/80 p-6">
            <h2 className="mb-4 text-xl font-semibold text-[#d8b362]">Histórico de lançamentos</h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#d8b362]/20 text-slate-400">
                    <th className="px-3 py-2 font-medium">Competência</th>
                    <th className="px-3 py-2 text-right font-medium">Receita</th>
                    <th className="px-3 py-2 text-right font-medium">Impostos</th>
                    <th className="px-3 py-2 text-right font-medium">Juros</th>
                    <th className="px-3 py-2 text-right font-medium">Multas</th>
                    <th className="px-3 py-2 text-right font-medium">Alíquota</th>
                    <th className="px-3 py-2 text-right font-medium">NFs</th>
                    <th className="px-3 py-2 text-right font-medium">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...dados.lancamentos].reverse().map((l) => {
                    const somaValor = l.impostos.reduce((t, i) => t + i.valor, 0);
                    const somaJuros = l.impostos.reduce((t, i) => t + i.juros, 0);
                    const somaMulta = l.impostos.reduce((t, i) => t + i.multa, 0);
                    const aliquota = somarAliquotas(l.impostos);
                    return (
                    <tr key={l.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-3 py-2 text-white">{rotuloMes(l.mes)}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{moeda(l.faturamento)}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{moeda(somaValor)}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{moeda(somaJuros)}</td>
                      <td className="px-3 py-2 text-right text-slate-300">{moeda(somaMulta)}</td>
                      <td className="px-3 py-2 text-right text-slate-300">
                        {aliquota === null ? '—' : `${pct.format(aliquota)}%`}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-300">{l.nfeQtd + l.nfseQtd}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setModo(l.mes);
                            setAba('painel');
                          }}
                          className="mr-4 text-xs text-[#d8b362] hover:underline"
                        >
                          Ver painel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMesModal(l.mes);
                            setModalAberto(true);
                          }}
                          className="text-xs text-slate-300 hover:underline"
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              {dados.lancamentos.length} {dados.lancamentos.length === 1 ? 'mês lançado' : 'meses lançados'}
              {periodo && contarMeses(periodo.de, periodo.ate) > 1 ? ` · painel em ${textoPeriodo}` : ''}
            </p>
          </div>
        </div>
      )}

      {modalAberto && dados && (
        <LancamentosModal
          empresa={dados.empresa}
          mesInicial={mesModal}
          onAtualizado={recarregar}
          onClose={() => setModalAberto(false)}
        />
      )}
    </main>
  );
}
