'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

// Páginas que podem ser abertas sem estar logado
const PUBLICAS = ['/login', '/redefinir-senha'];

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

  const publica = PUBLICAS.includes(pathname);

  useEffect(() => {
    if (estado === 'anonimo' && !publica) router.replace('/login');
  }, [estado, publica, router]);

  if (publica) return <>{children}</>;

  // Enquanto não sabe se há sessão, ou enquanto redireciona, não mostra nada da área restrita
  if (estado !== 'logado') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#020617] text-sm text-slate-500">
        Carregando...
      </div>
    );
  }

  return <>{children}</>;
}
