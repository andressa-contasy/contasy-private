'use client';

import Image from 'next/image';
import type { ReactNode, Ref } from 'react';
import { Plus_Jakarta_Sans } from 'next/font/google';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  ListChecks,
  Percent,
  Scale,
  ScrollText,
  TrendingUp,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { brl, pct, rotuloRegime } from '../../lib/formatacao';
import { rotuloMes } from '../../lib/painel';
import type { DadosEmpresa, ResultadoPainel } from '../../lib/painel';
import EvolucaoChart from './EvolucaoChart';
import styles from './painel.module.css';

const fonte = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const moeda = (centavos: number) => brl.format(centavos / 100);
const umaCasa = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const inteiro = new Intl.NumberFormat('pt-BR');

const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

// "Maíres de Deus Soares" -> "MD" (ignora conectores como "de", "da")
function iniciais(nome: string) {
  const palavras = nome.split(/\s+/).filter((p) => p && !CONECTORES.has(p.toLowerCase()));
  return palavras
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export default function PainelCliente({
  dados,
  resultado,
  seletor,
  exportando,
  painelRef,
}: {
  dados: DadosEmpresa;
  resultado: ResultadoPainel;
  seletor: ReactNode;
  exportando: boolean;
  painelRef: Ref<HTMLDivElement>;
}) {
  const { empresa, socios: cadastroSocios } = dados;
  const r = resultado;
  const unicoMes = r.meses === 1;
  const periodoTexto = unicoMes ? 'do Mês' : 'do Período';

  const regimeAtual = rotuloRegime(empresa.regime_tributario);
  const regimeAnterior = empresa.regime_anterior ? rotuloRegime(empresa.regime_anterior) : null;

  return (
    <div
      ref={painelRef}
      className={`${styles.painel} ${fonte.className}`}
      data-exportando={exportando ? '' : undefined}
    >
      <div className={styles.watermark} aria-hidden="true">
        <Image src="/logo-contasy-private.png" alt="" width={720} height={720} />
      </div>

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.marca}>
            <Image src="/logo-contasy-private.png" alt="Contasy Private" width={52} height={52} priority />
            <div>
              <div className={styles.marcaNome}>
                CONTASY <span>PRIVATE</span>
              </div>
              <div className={styles.marcaSub}>GESTÃO TRIBUTÁRIA DE ALTA PERFORMANCE</div>
            </div>
          </div>
          <div className={styles.seletor}>{seletor}</div>
        </header>

        <section className={`${styles.card} ${styles.relatorio}`}>
          <div>
            <h1 className={styles.relatorioTitulo}>Relatório de Desempenho Contábil e Estratégia Fiscal</h1>
            <div className={styles.relatorioEmpresa}>
              Empresa: {empresa.nome_empresa || 'Sem nome'} | CNPJ: {empresa.cnpj || '—'}
            </div>
          </div>
          {empresa.contador && (
            <div className={styles.contador}>
              <div className={styles.avatar}>{iniciais(empresa.contador.nome)}</div>
              <div>
                <div className={styles.contadorRotulo}>Contador Responsável Private</div>
                <div className={styles.contadorNome}>{empresa.contador.nome}</div>
                <div className={styles.contadorCrc}>{empresa.contador.crc}</div>
              </div>
            </div>
          )}
        </section>

        <div className={styles.kpis}>
          <section className={styles.card}>
            <div className={styles.kpiTopo}>
              <span className={styles.kpiRotulo}>Faturamento da Competência</span>
              <span className={styles.kpiIcone}>
                <TrendingUp size={18} />
              </span>
            </div>
            <div className={styles.kpiValor}>{moeda(r.faturamento)}</div>
            <div className={styles.kpiSub}>
              {r.variacaoFaturamento === null ? (
                <span>Sem período anterior para comparar</span>
              ) : (
                <>
                  <span className={r.variacaoFaturamento >= 0 ? styles.positivo : styles.negativo}>
                    {r.variacaoFaturamento >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  </span>
                  <span className={r.variacaoFaturamento >= 0 ? styles.positivo : styles.negativo}>
                    {r.variacaoFaturamento >= 0 ? '+' : ''}
                    {umaCasa.format(r.variacaoFaturamento)}%
                  </span>
                  <span>vs {unicoMes ? 'competência anterior' : 'período anterior'}</span>
                </>
              )}
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.kpiTopo}>
              <span className={styles.kpiRotulo}>Total Impostos Apurados</span>
              <span className={styles.kpiIcone}>
                <FileText size={18} />
              </span>
            </div>
            <div className={styles.kpiValor}>{moeda(r.totalImpostos)}</div>
            <div className={styles.kpiSub}>Impostos federais e municipais</div>
          </section>

          <section className={styles.card}>
            <div className={styles.kpiTopo}>
              <span className={styles.kpiRotulo}>Carga Tributária Efetiva</span>
              <span className={styles.kpiIcone}>
                <Percent size={18} />
              </span>
            </div>
            <div className={styles.kpiValor}>{r.carga === null ? '—' : `${umaCasa.format(r.carga)}%`}</div>
            <div className={styles.kpiSub}>
              {r.cargaMenorQueAnterior ? (
                <>
                  <span className={styles.positivo}>
                    <ArrowDown size={12} />
                  </span>
                  <span className={styles.positivo}>Otimização contínua</span>
                </>
              ) : (
                <span>Carga sobre o faturamento</span>
              )}
            </div>
          </section>
        </div>

        <div className={styles.grade}>
          <div className={styles.coluna}>
            <section className={styles.card}>
              <div className={styles.planejamentoTopo}>
                <h2 className={styles.cardTitulo}>
                  <Scale size={18} /> Planejamento e Economia Tributária
                </h2>
                <span className={styles.selo}>Estratégia Ativa</span>
              </div>
              <p className={styles.descricao}>
                {regimeAnterior
                  ? `Comparativo do regime tributário atual (${regimeAtual}) em relação ao modelo anterior (${regimeAnterior}):`
                  : `Regime tributário atual: ${regimeAtual}.`}
              </p>
              <div className={`${styles.caixaInterna} ${styles.cenarios}`}>
                <div>
                  <div className={styles.cenarioRotulo}>Cenário sem otimização</div>
                  <div className={`${styles.cenarioValor} ${styles.vermelho}`}>
                    {r.cenario > 0 ? moeda(r.cenario) : '—'}
                  </div>
                </div>
                <div>
                  <div className={styles.cenarioRotulo}>Com otimização Private</div>
                  <div className={`${styles.cenarioValor} ${styles.verde}`}>{moeda(r.totalImpostos)}</div>
                </div>
                <div>
                  <div className={styles.cenarioRotulo}>Economia acumulada no ano</div>
                  <div className={`${styles.cenarioValor} ${styles.dourado}`}>{moeda(r.economiaAno)}</div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitulo}>
                <TrendingUp size={18} /> Evolução da Carga Tributária Efetiva (%)
              </h2>
              {r.evolucao.length > 0 ? (
                <div className={styles.grafico}>
                  <EvolucaoChart pontos={r.evolucao} />
                </div>
              ) : (
                <p className={styles.vazio}>Sem dados suficientes para o gráfico.</p>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitulo}>
                <ListChecks size={18} /> Composição e Detalhamento dos Impostos
              </h2>
              {r.impostos.length > 0 ? (
                <table className={styles.tabela}>
                  <thead>
                    <tr>
                      <th>Imposto</th>
                      <th>Valor Apurado</th>
                      <th>Alíquota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.impostos.map((i) => (
                      <tr key={i.codigo}>
                        <td>{i.codigo}</td>
                        <td>{moeda(i.valor)}</td>
                        <td>
                          <span className={styles.pct}>
                            {i.aliquota === null ? '—' : i.aliquota === 'variavel' ? 'Variável' : `${pct.format(i.aliquota)}%`}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className={styles.vazio}>Nenhum imposto lançado no período.</p>
              )}
            </section>
          </div>

          <div className={styles.coluna}>
            <section className={`${styles.card} ${styles.time}`}>
              <div className={styles.timeTopo}>
                <div>
                  <div className={styles.timeRotulo}>Time Contasy em ação</div>
                  <div className={styles.timeTotal}>{inteiro.format(r.totalNfs)} NFs Escrituradas</div>
                  <div className={styles.timeSub}>Processamento mensal via Sistema Domínio</div>
                </div>
                <ScrollText className={styles.timeIcone} size={30} />
              </div>
              <div className={styles.nfs}>
                <div className={`${styles.caixaInterna} ${styles.nfCaixa}`}>
                  <div className={styles.nfRotulo}>NF-e (Produto)</div>
                  <div className={styles.nfQtd}>{inteiro.format(r.nfe.qtd)} NFs</div>
                  <div className={styles.nfValor}>{moeda(r.nfe.valor)}</div>
                </div>
                <div className={`${styles.caixaInterna} ${styles.nfCaixa}`}>
                  <div className={styles.nfRotulo}>NFS-e (Serviço)</div>
                  <div className={styles.nfQtd}>{inteiro.format(r.nfse.qtd)} NFs</div>
                  <div className={styles.nfValor}>{moeda(r.nfse.valor)}</div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitulo}>
                <UserCheck size={18} /> Ações Realizadas no Mês
              </h2>
              {r.acoes.length > 0 ? (
                <div className={styles.acoes}>
                  {r.acoes.map((a, i) => (
                    <div key={i} className={styles.acao}>
                      <div className={styles.acaoTitulo}>
                        {a.titulo}
                        {!unicoMes && <span className={styles.acaoMes}>{rotuloMes(a.mes)}</span>}
                      </div>
                      {a.descricao && <div className={styles.acaoDescricao}>{a.descricao}</div>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.vazio}>Nenhuma ação registrada no período.</p>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitulo}>
                <Wallet size={18} /> Remuneração dos Sócios
              </h2>
              {r.socios.length > 0 ? (
                <div className={styles.socios}>
                  {r.socios.map((s, i) => (
                    <div key={s.id} className={`${styles.caixaInterna} ${styles.socio}`}>
                      <div className={styles.socioNome}>
                        {s.nome} (Sócio {String(i + 1).padStart(2, '0')})
                      </div>
                      <div className={styles.socioLinha}>
                        <span>Pró-labore {periodoTexto}:</span>
                        <strong>{moeda(s.proLabore)}</strong>
                      </div>
                      <div className={styles.socioLinha}>
                        <span>Distribuição de Lucros:</span>
                        <strong className={styles.verde}>{moeda(s.distribuicao)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.vazio}>
                  {cadastroSocios.length === 0 ? 'Nenhum sócio cadastrado.' : 'Sem lançamentos no período.'}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
