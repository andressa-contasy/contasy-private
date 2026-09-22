'use client';

import { LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ghostButtonClasses } from '../lib/estilos';

// Encerra a sessão. O AuthGuard percebe o logout e leva para a tela de login.
export default function SairButton() {
  return (
    <button
      type="button"
      onClick={() => supabase.auth.signOut()}
      className={`${ghostButtonClasses} inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm`}
    >
      <LogOut size={16} /> Sair
    </button>
  );
}
