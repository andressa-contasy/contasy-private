'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// Páginas que podem ser abertas sem estar logado
const PUBLICAS = ['/login'];

// Endereço oficial do portal Neowit: só aceita a sessão se ela vier exatamente dali
const ORIGEM_PORTAL = 'https://portal-neowit.vercel.app';

export default function AuthGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [estado, setEstado] = useState<'carregando' | 'logado' | 'anonimo'>('carregando');

  useEffect(() => {
    let ativo = true;
    supabase.auth.getSession().then(({ data }) => {
      if (ativo) setEstado(data.session ? 'logado' : 'anonimo');
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      setEstado(sessao ? 'logado' : 'anonimo');
    });
    return () => {
      ativo = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Aberto dentro do portal: avisa que está pronto e escuta a sessão chegar por mensagem
  useEffect(() => {
    if (typeof window === 'undefined' || window.self === window.top) return; // não está num iframe

    function receberSessao(evento: MessageEvent) {
      if (evento.origin !== ORIGEM_PORTAL) return; // ignora qualquer origem que não seja o portal
      const dados = evento.data as { source?: string; type?: string; accessToken?: string; refreshToken?: string } | null;
      if (dados?.source !== 'portal-neowit' || dados.type !== 'session') return;
      if (!dados.accessToken || !dados.refreshToken) return;

      supabase.auth.setSession({ access_token: dados.accessToken, refresh_token: dados.refreshToken });
    }

    window.addEventListener('message', receberSessao);
    window.parent.postMessage({ source: 'contasy-private', type: 'ready' }, ORIGEM_PORTAL);

    return () => window.removeEventListener('message', receberSessao);
  }, []);

  const publica = PUBLICAS.includes(pathname);
  const dentroDeIframe = typeof window !== 'undefined' && window.self !== window.top;

  useEffect(() => {
    if (estado !== 'anonimo' || publica) return;
    // Dentro do portal, dá um tempo para a sessão chegar antes de mostrar a tela de login
    const tempo = setTimeout(() => router.replace('/login'), dentroDeIframe ? 3000 : 0);
    return () => clearTimeout(tempo);
  }, [estado, publica, dentroDeIframe, router]);

  if (publica) return <>{children}</>;

  // Enquanto não sabe se há sessão, ou enquanto espera a sessão do portal, não mostra nada da área restrita
  if (estado !== 'logado') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-sm text-slate-500">
        Carregando...
      </div>
    );
  }

  return <>{children}</>;
}
