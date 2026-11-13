import { handleSuccessfulTaskContentCleanup } from '@/lib/dabra/successful-task-cleanup-endpoint';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = handleSuccessfulTaskContentCleanup;
