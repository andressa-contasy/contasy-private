'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cardClasses, ghostButtonClasses, goldButtonClasses, inputClasses, labelClasses } from '../lib/estilos';

// Permite a quem está logado trocar a própria senha
export default function AlterarSenhaButton() {
  const [aberto, setAberto] = useState(false);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function fechar() {
    setAberto(false);
    setSenha('');
    setConfirmacao('');
    setErro(null);
    setSucesso(false);
  }

  // Fecha com a tecla Esc
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

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
    setSalvando(false);
    if (error) {
      setErro(`Não foi possível alterar a senha: ${error.message}`);
      return;
    }
    setSenha('');
    setConfirmacao('');
    setSucesso(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`${ghostButtonClasses} inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm`}
      >
        <KeyRound size={16} /> Alterar senha
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={fechar}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-alterar-senha"
            className={`${cardClasses} w-full max-w-md bg-[#0d1322] p-6`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id="titulo-alterar-senha" className="text-lg font-semibold text-[#d8b362]">
                Alterar minha senha
              </h2>
              <button
                type="button"
                onClick={fechar}
                aria-label="Fechar"
                className="px-2 text-2xl leading-none text-slate-400 hover:text-white"
              >
                &times;
              </button>
            </div>

            {sucesso ? (
              <div className="grid gap-4">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
                  Senha alterada com sucesso.
                </div>
                <button type="button" onClick={fechar} className={`${goldButtonClasses} rounded-lg px-5 py-2`}>
                  Fechar
                </button>
              </div>
            ) : (
              <form onSubmit={salvar} className="grid gap-4">
                <div>
                  <label htmlFor="nova-senha" className={labelClasses}>Nova senha</label>
                  <input
                    id="nova-senha"
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
                  <label htmlFor="confirmar-senha" className={labelClasses}>Repita a nova senha</label>
                  <input
                    id="confirmar-senha"
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
                  {salvando ? 'Salvando...' : 'Salvar nova senha'}
                </button>
                {erro && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</div>
                )}
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
