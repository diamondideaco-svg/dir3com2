import { runStagingSqlWithGuard } from './staging-sql-runner.mjs';

runStagingSqlWithGuard('supabase/staging-only/sandbox/20260810090000_sandbox_synthetic_training_layer.rollback.sql', 'rollback');
