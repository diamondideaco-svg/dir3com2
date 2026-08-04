export type AI2ToolAuthState = 'disabled' | 'pilot-readonly' | 'staging-approved' | 'production-approved';

export type AI2ToolCategory = 'knowledge' | 'support' | 'booking' | 'payments' | 'operations';

export type AI2ToolDefinition = {
  toolId: string;
  name: string;
  category: AI2ToolCategory;
  authState: AI2ToolAuthState;
  readOnly: boolean;
  requiresDgrApproval: boolean;
};

export const AI2_TOOL_REGISTRY: readonly AI2ToolDefinition[] = [
  {
    toolId: 'knowledge.lookup',
    name: 'Knowledge Lookup',
    category: 'knowledge',
    authState: 'pilot-readonly',
    readOnly: true,
    requiresDgrApproval: false,
  },
  {
    toolId: 'support.guidance',
    name: 'Support Guidance',
    category: 'support',
    authState: 'pilot-readonly',
    readOnly: true,
    requiresDgrApproval: false,
  },
  {
    toolId: 'booking.execute',
    name: 'Booking Execute',
    category: 'booking',
    authState: 'disabled',
    readOnly: false,
    requiresDgrApproval: true,
  },
  {
    toolId: 'payments.charge',
    name: 'Payments Charge',
    category: 'payments',
    authState: 'disabled',
    readOnly: false,
    requiresDgrApproval: true,
  },
];

export function getAI2EnabledTools(): AI2ToolDefinition[] {
  return AI2_TOOL_REGISTRY.filter((tool) => tool.authState !== 'disabled');
}