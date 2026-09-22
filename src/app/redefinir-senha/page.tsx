'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { cardClasses, goldButtonClasses, inputClasses, labelClasses } from '../../lib/estilos';

// Página aberta pelo link do e-mail "Esqueci minha senha"
export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [pronto, setPronto] = useState(false); // sessão de recuperação reconhecida
  const [verificando, setVerificando] = useState(true);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    // O supabase-js lê o link e cria a sessão de recuperação sozinho
    const { data } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'PASSWORD_RECOVERY' || sessao) {
        setPronto(true);
        setVerificando(false);
      }
    });
    supabase.auth.getSession().then(({ data: atual }) => {
      if (atual.session) setPronto(true);
    });
    const tempo = setTimeout(() => setVerificando(false), 2500);
    return () => {
      data.subscription.unsubscribe();
      clearTimeout(tempo);
    };
  }, []);

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não são iguais.');
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) {
      setErro(`Não foi possível salvar a senha: ${error.message}`);
      setSalvando(false);
      return;
    }
    router.replace('/');
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#020617] p-6 text-slate-200">
      <div className={`${cardClasses} w-full max-w-md p-8`}>
        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo-contasy.png" alt="Contasy Private" width={48} height={48} className="rounded-xl" />
          <h1 className="text-xl font-semibold text-[#d8b362]">Criar nova senha</h1>
        </div>

        {verificando && !pronto ? (
          <p className="text-sm text-slate-400">Verificando o link...</p>
        ) : !pronto ? (
          <div className="grid gap-4">
            <p className="text-sm text-red-300">Este link é inválido ou já expirou.</p>
            <button
              type="button"
              onClick={() => router.replace('/login')}
              className={`${goldButtonClasses} rounded-lg px-5 py-2`}
            >
              Voltar para o login
            </button>
          </div>
        ) : (
          <form onSubmit={salvar} className="grid gap-4">
            <div>
              <label htmlFor="senha" className={labelClasses}>Nova senha</label>
              <input
                id="senha"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label htmlFor="confirmacao" className={labelClasses}>Repita a nova senha</label>
              <input
                id="confirmacao"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className={inputClasses}
              />
            </div>
            <button type="submit" disabled={salvando} className={`${goldButtonClasses} rounded-lg px-5 py-2`}>
              {salvando ? 'Salvando...' : 'Salvar senha'}
            </button>
            {erro && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</div>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
