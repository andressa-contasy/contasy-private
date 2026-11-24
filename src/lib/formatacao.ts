export const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const pct = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Os campos monetários trabalham em centavos (inteiros) para evitar erro de ponto flutuante
export const formatarCentavos = (centavos: number) => brl.format(centavos / 100);
export const emCentavos = (valor: number | string | null | undefined) =>
  Math.round(Number(valor ?? 0) * 100);

// Aplica a máscara XXX.XXX.XXX-XX enquanto o usuário digita.
export function mascararCpf(valor: string) {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  let r = d.slice(0, 3);
  if (d.length > 3) r += '.' + d.slice(3, 6);
  if (d.length > 6) r += '.' + d.slice(6, 9);
  if (d.length > 9) r += '-' + d.slice(9, 11);
  return r;
}

export function mesAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatarMes(mes: string) {
  const [ano, m] = mes.split('-');
  return `${m}/${ano}`;
}

// IRPJ e CSLL do Lucro Presumido são trimestrais: só são lançados nos meses de fechamento
export const ehMesFechamentoTrimestre = (mes: string) =>
  [3, 6, 9, 12].includes(Number(mes.split('-')[1]));

export const REGIMES = {
  simples_nacional: 'Simples Nacional',
  lucro_presumido: 'Lucro Presumido',
} as const;

export const PORTES = {
  mei: 'MEI',
  me: 'ME',
  epp: 'EPP',
} as const;

export const rotuloRegime = (regime?: string | null) =>
  regime ? (REGIMES[regime as keyof typeof REGIMES] ?? regime) : '—';

export const rotuloPorte = (porte?: string | null) =>
  porte ? (PORTES[porte as keyof typeof PORTES] ?? porte) : '—';

export const STATUS_CLIENTE = {
  ativa_mensal: 'Ativa — Paga Mensalmente',
  ativa_parceria: 'Ativa — Parceria',
  inadimplente: 'Inadimplente',
  em_migracao: 'Em Processo de Migração',
} as const;

export const rotuloStatusCliente = (status?: string | null) =>
  status ? (STATUS_CLIENTE[status as keyof typeof STATUS_CLIENTE] ?? status) : 'Sem tag';

// Soma as alíquotas digitadas dos impostos de uma guia (um mês). Se faltar a alíquota de
// algum imposto lançado naquele mês, retorna null em vez de somar só uma parte — uma soma
// incompleta subestimaria o total e voltaria a induzir a erro.
export function somarAliquotas(linhas: { aliquota: number | null }[]): number | null {
  if (linhas.length === 0) return null;
  if (linhas.some((l) => l.aliquota === null)) return null;
  return linhas.reduce((total, l) => total + (l.aliquota as number), 0);
}
