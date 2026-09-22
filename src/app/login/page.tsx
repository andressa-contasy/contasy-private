'use client';

import { Suspense, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import { cardClasses, goldButtonClasses, ghostButtonClasses, inputClasses, labelClasses } from '../../lib/estilos';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [entrandoGoogle, setEntrandoGoogle] = useState(false);
  const [enviandoLink, setEnviandoLink] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Quem já está logado vai direto para o painel
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace('/');
    });
  }, [router]);

  // O Google pode voltar com um erro na própria URL (ex.: provedor ainda não configurado)
  useEffect(() => {
    const descricao = searchParams.get('error_description');
    if (descricao) setErro(decodeURIComponent(descricao.replace(/\+/g, ' ')));
  }, [searchParams]);

  async function entrarComGoogle() {
    setErro(null);
    setAviso(null);
    setEntrandoGoogle(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    // Em caso de sucesso o navegador já é redirecionado para o Google; só chega aqui se falhar
    if (error) {
      setErro(`Não foi possível entrar com Google: ${error.message}`);
      setEntrandoGoogle(false);
    }
  }

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
        <Image src="/logo-contasy.png" alt="" width={800} height={800} className="h-auto w-[min(80vw,800px)] select-none" />
      </div>

      <div className={`${cardClasses} relative w-full max-w-md p-8`}>
        <div className="mb-6 flex items-center gap-4">
          <Image src="/logo-contasy.png" alt="Contasy Private" width={56} height={56} priority className="rounded-xl" />
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

        <button
          type="button"
          onClick={entrarComGoogle}
          disabled={entrandoGoogle}
          className={`${ghostButtonClasses} flex w-full items-center justify-center gap-3 rounded-lg px-5 py-2.5 font-medium`}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z" />
          </svg>
          {entrandoGoogle ? 'Redirecionando...' : 'Entrar com Google'}
        </button>

        <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
          <div className="h-px flex-1 bg-white/10" />
          ou
          <div className="h-px flex-1 bg-white/10" />
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
