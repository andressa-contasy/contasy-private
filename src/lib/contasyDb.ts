import 'server-only';
import mysql from 'mysql2/promise';

// Acesso só leitura ao banco de produção da Contasy (usuário time_leitura). Nunca importar
// este módulo em código de cliente — a senha só pode existir no servidor.
const somenteDigitos = (v: string) => v.replace(/\D/g, '');

export type VencimentosCertificados = {
  empresa: string | null; // data ISO (AAAA-MM-DD) do e-CNPJ, ou null se não encontrado
  socios: Record<string, string | null>; // cpf (só dígitos) -> data ISO do e-CPF, ou null
};

async function conectar() {
  const conn = await mysql.createConnection({
    host: process.env.CONTASY_DB_HOST,
    port: Number(process.env.CONTASY_DB_PORT),
    user: process.env.CONTASY_DB_USER,
    password: process.env.CONTASY_DB_PASSWORD,
    database: process.env.CONTASY_DB_NAME,
    ssl: { rejectUnauthorized: false },
    timezone: 'Z',
  });
  // Corta qualquer consulta que passe de 60s, para não pesar no banco de produção
  await conn.query('SET SESSION max_execution_time = 60000');
  return conn;
}

const comoData = (valor: unknown) => (valor ? new Date(valor as string).toISOString().slice(0, 10) : null);

// Busca o vencimento do certificado digital da empresa (e-CNPJ, por CNPJ) e de cada sócio
// (e-CPF, por CPF). Nunca lê as colunas de certificado/senha em si — só a data de vencimento.
export async function buscarVencimentosCertificados(
  cnpj: string,
  cpfs: string[],
): Promise<VencimentosCertificados> {
  const cnpjLimpo = somenteDigitos(cnpj);
  const cpfsLimpos = [...new Set(cpfs.map(somenteDigitos).filter(Boolean))];

  const conn = await conectar();
  try {
    let empresaVencimento: string | null = null;
    if (cnpjLimpo) {
      const [empresas] = await conn.query('SELECT id FROM companies WHERE cnpj_number = ? LIMIT 1', [cnpjLimpo]);
      const empresaId = (empresas as Array<{ id: string }>)[0]?.id;
      if (empresaId) {
        const [docs] = await conn.query(
          `SELECT digital_certificate_due_date FROM companies_documents
           WHERE company_id = ? AND name = 'digital_certificate_cnpj'
           ORDER BY digital_certificate_due_date DESC LIMIT 1`,
          [empresaId],
        );
        empresaVencimento = comoData((docs as Array<{ digital_certificate_due_date: unknown }>)[0]?.digital_certificate_due_date);
      }
    }

    const socios: Record<string, string | null> = {};
    if (cpfsLimpos.length > 0) {
      const marcadores = cpfsLimpos.map(() => '?').join(',');
      const [usuarios] = await conn.query(
        `SELECT id, document FROM users WHERE document IN (${marcadores}) LIMIT ${cpfsLimpos.length}`,
        cpfsLimpos,
      );
      const idPorCpf = new Map(
        (usuarios as Array<{ id: string; document: string }>).map((u) => [u.document, u.id]),
      );

      const ids = [...idPorCpf.values()];
      const dataPorUserId = new Map<string, unknown>();
      if (ids.length > 0) {
        const marcadoresIds = ids.map(() => '?').join(',');
        const [docs] = await conn.query(
          `SELECT user_id, digital_certificate_due_date FROM users_documents
           WHERE user_id IN (${marcadoresIds}) LIMIT ${ids.length}`,
          ids,
        );
        for (const d of docs as Array<{ user_id: string; digital_certificate_due_date: unknown }>) {
          dataPorUserId.set(d.user_id, d.digital_certificate_due_date);
        }
      }

      for (const cpf of cpfsLimpos) {
        const userId = idPorCpf.get(cpf);
        socios[cpf] = userId ? comoData(dataPorUserId.get(userId)) : null;
      }
    }

    return { empresa: empresaVencimento, socios };
  } finally {
    await conn.end();
  }
}
