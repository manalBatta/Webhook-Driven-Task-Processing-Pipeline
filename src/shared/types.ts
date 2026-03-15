export type CreatePipelineInput = {
    name: string;
    actionType: string;
    actionConfig?: Record<string, unknown>;
  };