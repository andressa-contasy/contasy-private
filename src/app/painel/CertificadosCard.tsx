'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import styles from './painel.module.css';

type Socio = { id: string; nome: string; cpf: string | null };

type Resultado = { empresa: string | null; socios: Record<string, string | null> };

const MS_POR_DIA = 86_400_000;

function diasRestantes(iso: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(`${iso}T00:00:00`);
  return Math.round((venc.getTime() - hoje.getTime()) / MS_POR_DIA);
}

function Linha({ rotulo, vencimentoIso }: { rotulo: string; vencimentoIso: string | null | undefined }) {
  if (vencimentoIso === undefined) {
    return (
      <div className={styles.socioLinha}>
        <span>{rotulo}:</span>
        <strong>CPF não cadastrado</strong>
      </div>
    );
  }
  if (vencimentoIso === null) {
    return (
      <div className={styles.socioLinha}>
        <span>{rotulo}:</span>
        <strong>Sem registro na Contasy</strong>
      </div>
    );
  }

  const dias = diasRestantes(vencimentoIso);
  const dataFormatada = new Date(`${vencimentoIso}T00:00:00`).toLocaleDateString('pt-BR');
  const classe = dias < 0 || dias <= 30 ? styles.negativo : dias <= 60 ? styles.alerta : styles.positivo;
  const texto = dias < 0 ? `Vencido há ${Math.abs(dias)} dias` : `Vence em ${dias} dias`;

  return (
    <div className={styles.socioLinha}>
      <span>{rotulo}:</span>
      <strong className={classe}>
        {texto} ({dataFormatada})
      </strong>
    </div>
  );
}

export default function CertificadosCard({ cnpj, socios }: { cnpj: string | null; socios: Socio[] }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCarregando(true);
      setErro(null);
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const token = sessao.session?.access_token;
        if (!token) throw new Error('Sessão não encontrada.');

        const cpfs = socios.map((s) => s.cpf).filter((c): c is string => !!c);
        const resp = await fetch('/api/certificados', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ cnpj: cnpj ?? '', cpfs }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Erro ao consultar certificados.');
        if (!cancelado) setResultado(json);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cnpj, JSON.stringify(socios.map((s) => s.cpf))]);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitulo}>
        <ShieldCheck size={18} /> Certificado Digital
      </h2>
      {carregando ? (
        <p className={styles.vazio}>Consultando...</p>
      ) : erro ? (
        <p className={styles.vazio}>Não foi possível consultar: {erro}</p>
      ) : (
        <div className={styles.socios}>
          <div className={`${styles.caixaInterna} ${styles.socio}`}>
            <Linha rotulo="e-CNPJ da empresa" vencimentoIso={resultado?.empresa ?? null} />
          </div>
          {socios.map((s) => (
            <div key={s.id} className={`${styles.caixaInterna} ${styles.socio}`}>
              <div className={styles.socioNome}>{s.nome}</div>
              <Linha
                rotulo="e-CPF"
                vencimentoIso={s.cpf ? (resultado?.socios[s.cpf.replace(/\D/g, '')] ?? null) : undefined}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
