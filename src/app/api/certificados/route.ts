import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buscarVencimentosCertificados } from '../../../lib/contasyDb';

// Rota só do servidor: a senha do banco da Contasy nunca chega no navegador. Exige sessão
// válida do Supabase (mesmo login usado no resto do app) para evitar consulta anônima.
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: auth, error: erroAuth } = await supabase.auth.getUser(token);
  if (erroAuth || !auth.user) {
    return NextResponse.json({ error: 'Sessão inválida.' }, { status: 401 });
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ error: 'Corpo da requisição inválido.' }, { status: 400 });
  }

  const { cnpj, cpfs } = corpo as { cnpj?: unknown; cpfs?: unknown };
  if (typeof cnpj !== 'string' || !Array.isArray(cpfs) || !cpfs.every((c) => typeof c === 'string')) {
    return NextResponse.json({ error: 'Parâmetros inválidos.' }, { status: 400 });
  }

  try {
    const resultado = await buscarVencimentosCertificados(cnpj, cpfs);
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json(
      { error: `Erro ao consultar certificados: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
