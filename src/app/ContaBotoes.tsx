'use client';

import AlterarSenhaButton from './AlterarSenhaButton';
import SairButton from './SairButton';

// Botões da conta de quem está logado, usados no topo das telas
export default function ContaBotoes() {
  return (
    <div className="flex items-center gap-2">
      <AlterarSenhaButton />
      <SairButton />
    </div>
  );
}
