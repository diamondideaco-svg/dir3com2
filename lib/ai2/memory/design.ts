export type AI2MemoryTier = 'request' | 'session' | 'long-term';

export type AI2MemoryPolicy = {
  longTermEnabled: false;
  allowedTiers: readonly AI2MemoryTier[];
  retentionSecondsByTier: {
    request: number;
    session: number;
  };
};

export const AI2_MEMORY_POLICY: AI2MemoryPolicy = {
  longTermEnabled: false,
  allowedTiers: ['request', 'session'],
  retentionSecondsByTier: {
    request: 300,
    session: 7200,
  },
};

export type AI2LongTermMemoryDesign = {
  status: 'design-only';
  activationRequires: readonly string[];
  storageIsolationModel: 'tenant-scoped';
};

export const AI2_LONG_TERM_MEMORY_DESIGN: AI2LongTermMemoryDesign = {
  status: 'design-only',
  activationRequires: ['Dedicated DGR approval', 'Security review sign-off', 'Data retention policy approval'],
  storageIsolationModel: 'tenant-scoped',
};