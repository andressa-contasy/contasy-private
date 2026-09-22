'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { cardClasses, goldButtonClasses, inputClasses, labelClasses } from '../../lib/estilos';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [enviandoLink, setEnviandoLink] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Quem já está logado vai direto para o painel
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  async function entrar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    setAviso(null);

    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });

    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha incorretos.'
          : `Não foi possível entrar: ${error.message}`,
      );
      setEntrando(false);
      return;
    }
    router.replace('/');
  }

  async function esqueciSenha() {
    setErro(null);
    setAviso(null);
    if (!email.trim()) {
      setErro('Digite seu e-mail acima e clique em "Esqueci minha senha" de novo.');
      return;
    }
    setEnviandoLink(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });
    setEnviandoLink(false);
    if (error) {
      setErro(`Não foi possível enviar o link: ${error.message}`);
      return;
    }
    // Mesma resposta exista ou não o e-mail, para não revelar quem tem conta
    setAviso('Se este e-mail tiver acesso, você vai receber um link para criar uma nova senha.');
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#020617] p-6 text-slate-200">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5">
        <Image src="/logo-contasy-private.png" alt="" width={800} height={800} className="h-auto w-[min(80vw,800px)] select-none" />
      </div>

      <div className={`${cardClasses} relative w-full max-w-md p-8`}>
        <div className="mb-6 flex items-center gap-4">
          <Image src="/logo-contasy-private.png" alt="Contasy Private" width={56} height={56} priority className="rounded-xl" />
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-wide text-white">CONTASY</h1>
              <span className="rounded border border-[#d8b362]/40 bg-[#d8b362]/20 px-2 py-0.5 text-xs font-bold text-[#d8b362]">
                PRIVATE
              </span>
            </div>
            <p className="text-sm text-slate-400">Acesso restrito ao time</p>
          </div>
        </div>

        <form onSubmit={entrar} className="grid gap-4">
          <div>
            <label htmlFor="email" className={labelClasses}>E-mail</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="senha" className={labelClasses}>Senha</label>
            <input
              id="senha"
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className={inputClasses}
            />
          </div>

          <button type="submit" disabled={entrando} className={`${goldButtonClasses} rounded-lg px-5 py-2.5`}>
            {entrando ? 'Entrando...' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={esqueciSenha}
            disabled={enviandoLink}
            className="justify-self-center text-sm text-[#d8b362] hover:underline disabled:opacity-60"
          >
            {enviandoLink ? 'Enviando...' : 'Esqueci minha senha'}
          </button>
        </form>

        {erro && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</div>
        )}
        {aviso && (
          <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
            {aviso}
          </div>
        )}
      </div>
    </main>
  );
}
