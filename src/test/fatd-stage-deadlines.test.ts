// @vitest-environment node
import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';

// Only temporary tables receive test rows. No application document, user,
// deadline, movement or audit row is created or modified by this suite.
const url = process.env['SUPABASE_DB_URL'];
const db = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;
afterAll(async () => { await db?.end(); });

describe.skipIf(!db)('FATD stage database rules', () => {
  async function temporaryStage(run: (sql: postgres.TransactionSql) => Promise<void>) {
    if (!db) throw new Error('SUPABASE_DB_URL is required for database tests');
    await db.begin(async sql => {
      await sql`CREATE TEMP TABLE test_fatd_stage (LIKE public.fatd_stage_deadlines INCLUDING ALL) ON COMMIT DROP`;
      await run(sql);
    });
  }

  async function insert(sql: postgres.TransactionSql, stage: string, status = 'pendente', completed: string | null = null, due: string | null = null) {
    return sql`INSERT INTO test_fatd_stage (unit_id, document_id, stage, created_by, status, completed_date, due_date)
      VALUES ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', ${stage},
        '00000000-0000-4000-8000-000000000003', ${status}, ${completed}, ${due}) RETURNING stage, status, completed_date::text, due_date::text`;
  }

  async function validationTrigger(sql: postgres.TransactionSql) {
    // Exercise the installed function body with a temporary parent registry.
    // No privileges are widened and no official documents are inserted.
    await sql`CREATE TEMP TABLE test_fatd_documents (id uuid PRIMARY KEY, unit_id uuid, type_code text) ON COMMIT DROP`;
    const rows = await sql`SELECT pg_get_functiondef('public.validate_fatd_stage_deadline()'::regprocedure) AS definition`;
    const definition = rows[0]?.['definition'];
    if (typeof definition !== 'string') throw new Error('Validation function missing');
    await sql.unsafe(definition.replace('public.validate_fatd_stage_deadline()', 'pg_temp.test_fatd_validation()').replace('public.documents', 'pg_temp.test_fatd_documents'));
    await sql`CREATE TRIGGER validate_test_stage BEFORE INSERT OR UPDATE ON test_fatd_stage
      FOR EACH ROW EXECUTE FUNCTION pg_temp.test_fatd_validation()`;
  }

  it('accepts exactly defesa, revisao_cmt_companhia and julgamento', async () => {
    await temporaryStage(async sql => {
      for (const stage of ['defesa', 'revisao_cmt_companhia', 'julgamento']) {
        const rows = await insert(sql, stage);
        expect(rows[0]?.['stage']).toBe(stage);
      }
    });
    await expect(temporaryStage(async sql => { await insert(sql, 'outra'); })).rejects.toMatchObject({ code: '23514' });
  });

  it('allows each stage only once per central document', async () => {
    await expect(temporaryStage(async sql => {
      await insert(sql, 'defesa');
      await insert(sql, 'defesa');
    })).rejects.toMatchObject({ code: '23505' });
  });

  it('keeps the manual deadline unset rather than computing a legal deadline', async () => {
    await temporaryStage(async sql => {
      const rows = await insert(sql, 'defesa');
      expect(rows[0]?.['due_date']).toBeNull();
      expect(rows[0]?.['status']).toBe('pendente');
      expect(rows[0]?.['completed_date']).toBeNull();
    });
  });

  it('preserves manual historical deadline and completion dates', async () => {
    await temporaryStage(async sql => {
      const rows = await insert(sql, 'julgamento', 'concluido', '1999-01-02', '1999-01-01');
      expect(rows[0]?.['completed_date']).toBe('1999-01-02');
      expect(rows[0]?.['due_date']).toBe('1999-01-01');
    });
  });

  it('requires an explicit completion date for a completed stage', async () => {
    await expect(temporaryStage(async sql => { await insert(sql, 'defesa', 'concluido'); })).rejects.toMatchObject({ code: '23514' });
  });

  it('does not retain a completion date on a pending stage', async () => {
    await expect(temporaryStage(async sql => { await insert(sql, 'defesa', 'pendente', '1999-01-02'); })).rejects.toMatchObject({ code: '23514' });
  });

  it('rejects a status other than pending or completed', async () => {
    await expect(temporaryStage(async sql => { await insert(sql, 'defesa', 'em_andamento'); })).rejects.toMatchObject({ code: '23514' });
  });

  it('validates the central document on the server, not only via a foreign key', async () => {
    await expect(temporaryStage(async sql => {
      await validationTrigger(sql);
      await insert(sql, 'defesa');
    })).rejects.toMatchObject({ message: 'A etapa deve pertencer a uma FATD da mesma unidade' });
  });

  it('prevents moving a stage to another unit', async () => {
    await expect(temporaryStage(async sql => {
      await insert(sql, 'defesa');
      await validationTrigger(sql);
      await sql`UPDATE test_fatd_stage SET unit_id = '00000000-0000-4000-8000-000000000004'`;
    })).rejects.toMatchObject({ message: 'Não é permitido transferir a etapa, unidade ou autor' });
  });

  it('rejects a central document that is not FATD', async () => {
    await expect(temporaryStage(async sql => {
      await validationTrigger(sql);
      await sql`INSERT INTO test_fatd_documents VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'diex')`;
      await insert(sql, 'defesa');
    })).rejects.toMatchObject({ message: 'A etapa deve pertencer a uma FATD da mesma unidade' });
  });

  it('rejects a FATD belonging to a different unit', async () => {
    await expect(temporaryStage(async sql => {
      await validationTrigger(sql);
      await sql`INSERT INTO test_fatd_documents VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000004', 'fatd')`;
      await insert(sql, 'defesa');
    })).rejects.toMatchObject({ message: 'A etapa deve pertencer a uma FATD da mesma unidade' });
  });

  it('accepts a FATD from the same unit without changing manual historical dates', async () => {
    await temporaryStage(async sql => {
      await validationTrigger(sql);
      await sql`INSERT INTO test_fatd_documents VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'fatd')`;
      const rows = await insert(sql, 'defesa', 'concluido', '1999-01-02', '1999-01-01');
      expect(rows[0]?.['completed_date']).toBe('1999-01-02');
      expect(rows[0]?.['due_date']).toBe('1999-01-01');
    });
  });

  it('records old/new stage data and movements atomically on insert and update', async () => {
    await temporaryStage(async sql => {
      await validationTrigger(sql);
      await sql`INSERT INTO test_fatd_documents VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'fatd')`;
      await sql`CREATE TEMP TABLE test_fatd_audit (LIKE public.audit_logs INCLUDING ALL) ON COMMIT DROP`;
      await sql`CREATE TEMP TABLE test_fatd_movements (LIKE public.document_movements INCLUDING ALL) ON COMMIT DROP`;
      const definitions = await sql`SELECT pg_get_functiondef('public.record_fatd_stage_deadline()'::regprocedure) AS definition`;
      const definition = definitions[0]?.['definition'];
      if (typeof definition !== 'string') throw new Error('Audit function missing');
      // The restricted test connection cannot read the managed auth schema;
      // the temporary copy uses no actor instead of creating a test account.
      await sql.unsafe(definition.replace('public.record_fatd_stage_deadline()', 'pg_temp.test_fatd_record()')
        .replace('public.audit_logs', 'pg_temp.test_fatd_audit').replace('public.document_movements', 'pg_temp.test_fatd_movements')
        .replaceAll('auth.uid()', 'NULL::uuid'));
      await sql`CREATE TRIGGER record_test_stage AFTER INSERT OR UPDATE ON test_fatd_stage FOR EACH ROW EXECUTE FUNCTION pg_temp.test_fatd_record()`;
      await insert(sql, 'defesa');
      await sql`UPDATE test_fatd_stage SET status = 'concluido', completed_date = '1999-01-02'`;
      const audit = await sql`SELECT action, old_data->>'status' AS old_status, new_data->>'status' AS new_status,
        new_data->>'completed_date' AS completion FROM test_fatd_audit ORDER BY action`;
      expect(audit.map(row => ({ action: row['action'], old: row['old_status'], next: row['new_status'], completion: row['completion'] }))).toEqual([
        { action: 'INSERT', old: null, next: 'pendente', completion: null },
        { action: 'UPDATE', old: 'pendente', next: 'concluido', completion: '1999-01-02' },
      ]);
      const movements = await sql`SELECT count(*)::integer AS total FROM test_fatd_movements
        WHERE document_id = '00000000-0000-4000-8000-000000000002' AND unit_id = '00000000-0000-4000-8000-000000000001'`;
      expect(movements[0]?.['total']).toBe(2);
    });
  });

  it('prevents reclassifying a parent FATD with existing stages', async () => {
    await expect(temporaryStage(async sql => {
      await validationTrigger(sql);
      await sql`INSERT INTO test_fatd_documents VALUES ('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'fatd')`;
      await insert(sql, 'defesa');
      const definitions = await sql`SELECT pg_get_functiondef('public.guard_fatd_document_stages()'::regprocedure) AS definition`;
      const definition = definitions[0]?.['definition'];
      if (typeof definition !== 'string') throw new Error('Parent guard missing');
      await sql.unsafe(definition.replace('public.guard_fatd_document_stages()', 'pg_temp.test_fatd_parent_guard()')
        .replace('public.fatd_stage_deadlines', 'pg_temp.test_fatd_stage'));
      await sql`CREATE TRIGGER guard_test_parent BEFORE UPDATE OF type_code, unit_id ON test_fatd_documents
        FOR EACH ROW EXECUTE FUNCTION pg_temp.test_fatd_parent_guard()`;
      await sql`UPDATE test_fatd_documents SET type_code = 'diex'`;
    })).rejects.toMatchObject({ message: 'Documento com etapas de FATD não pode mudar de tipo ou unidade' });
  });

  it('grants authenticated read/insert/update only, with no anonymous access', async () => {
    if (!db) throw new Error('Database connection required');
    const rows = await db`SELECT
      has_table_privilege('authenticated', 'public.fatd_stage_deadlines', 'SELECT') AS read,
      has_table_privilege('authenticated', 'public.fatd_stage_deadlines', 'INSERT') AS insert,
      has_table_privilege('authenticated', 'public.fatd_stage_deadlines', 'UPDATE') AS update,
      has_table_privilege('authenticated', 'public.fatd_stage_deadlines', 'DELETE') AS delete,
      has_table_privilege('anon', 'public.fatd_stage_deadlines', 'SELECT') AS anonymous`;
    expect(rows[0]).toMatchObject({ read: true, insert: true, update: true, delete: false, anonymous: false });
  });

  it('enables unit RLS, excluding consulta from both write policies', async () => {
    if (!db) throw new Error('Database connection required');
    const tables = await db`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.fatd_stage_deadlines'::regclass`;
    expect(tables[0]?.['relrowsecurity']).toBe(true);
    const policies = await db`SELECT cmd, qual, with_check FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fatd_stage_deadlines' ORDER BY cmd`;
    expect(policies.map(row => row['cmd'])).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    for (const policy of policies) {
      const rule = String(policy['with_check'] ?? policy['qual']);
      expect(rule).toContain('unit_id = my_unit()');
      if (policy['cmd'] !== 'SELECT') {
        for (const role of ['administrador', 'chefe', 'operador']) expect(rule).toContain(`'${role}'::app_role`);
        expect(rule).not.toContain("'consulta'::app_role");
      }
    }
  });

  it('attaches validation, audit/movements, and parent type protection triggers', async () => {
    if (!db) throw new Error('Database connection required');
    const rows = await db`SELECT t.tgname, p.prosecdef FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgname IN ('validate_fatd_stage_deadline', 'record_fatd_stage_deadline', 'guard_fatd_document_stages') ORDER BY t.tgname`;
    expect(rows.map(row => ({ name: row['tgname'], privileged: row['prosecdef'] }))).toEqual([
      { name: 'guard_fatd_document_stages', privileged: true },
      { name: 'record_fatd_stage_deadline', privileged: true },
      { name: 'validate_fatd_stage_deadline', privileged: false },
    ]);
  });
});