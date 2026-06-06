/**
 * migrate-passwords.ts
 * Migra senhas em plaintext de employee_auth para hashes bcrypt.
 *
 * Rodar UMA vez após deploy do auth.ts atualizado:
 *   npx ts-node scripts/migrate-passwords.ts
 *
 * Seguro re-executar: registros que já são hashes bcrypt ($2a$...) são ignorados.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcryptjs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dotenv = require('dotenv');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Erro: EXPO_PUBLIC_SUPABASE_URL ou EXPO_PUBLIC_SUPABASE_SERVICE_KEY não definidos em .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function migrate() {
  const { data: registros, error } = await supabase
    .from('employee_auth')
    .select('id, password_hash');

  if (error) {
    console.error('Erro ao buscar registros:', error.message);
    process.exit(1);
  }

  if (!registros || registros.length === 0) {
    console.log('Nenhum registro encontrado em employee_auth.');
    return;
  }

  console.log(`Total de registros: ${registros.length}`);

  let migrados = 0;
  let ignorados = 0;

  for (const reg of registros) {
    // Hashes bcrypt sempre começam com $2a$, $2b$ ou $2y$
    if (reg.password_hash?.startsWith('$2')) {
      ignorados++;
      continue;
    }

    const novoHash = await bcrypt.hash(reg.password_hash, 10);

    const { error: updateError } = await supabase
      .from('employee_auth')
      .update({ password_hash: novoHash })
      .eq('id', reg.id);

    if (updateError) {
      console.error(`Erro ao migrar id=${reg.id}: ${updateError.message}`);
    } else {
      console.log(`Migrado: ${reg.id}`);
      migrados++;
    }
  }

  console.log(`\nMigração concluída — ${migrados} registros atualizados, ${ignorados} já eram bcrypt (ignorados).`);
}

migrate();
