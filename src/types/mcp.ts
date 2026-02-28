export interface ToolCallContext {
  requestId: string;
  caller: string;
}

export interface McpToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  execute: (input: TInput, context: ToolCallContext) => Promise<TOutput>;
}

export interface McpResourceDefinition<TQuery, TData> {
  uriTemplate: string;
  description: string;
  read: (query: TQuery) => Promise<TData>;
}
