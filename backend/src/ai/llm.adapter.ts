import OpenAI from 'openai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractDemoPreferences, respondDemo } from './demo-llm.js';
import type {
  Response,
  ResponseInputItem,
  ResponseOutputItem,
} from 'openai/resources/responses/responses';
import type {
  ChatCompletion,
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';

type ChatAssistantItem = {
  type: 'chat_assistant';
  message: ChatCompletionAssistantMessageParam;
};
export type LlmInputItem = ResponseInputItem | ChatAssistantItem;

export type ToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};
export type LlmInput = {
  instructions: string;
  input: LlmInputItem[];
  tools: ToolDefinition[];
  maxOutputTokens: number;
  timeoutMs?: number;
};
export type LlmOutput = {
  text: string;
  calls: Array<{ callId: string; name: string; arguments: string }>;
  totalTokens: number;
  output: Array<
    | ChatAssistantItem
    | Extract<
        ResponseOutputItem,
        { type: 'message' | 'reasoning' | 'function_call' }
      >
  >;
};

export function configuredModelVersion(config: ConfigService): string {
  switch (config.get<string>('AI_PROVIDER', 'mock')) {
    case 'gemini':
      return config.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');
    case 'openai':
      return config.get<string>('OPENAI_MODEL', 'gpt-4.1-mini');
    default:
      return 'mock';
  }
}
export type PreferenceExtractionOutput = { json: string; totalTokens: number };
export type ExtractionOptions = {
  maxOutputTokens: number;
  timeoutMs: number;
};

export class LlmResponseError extends Error {
  constructor(
    code: string,
    readonly totalTokens: number,
  ) {
    super(code);
  }
}

const preferenceExtractionInstructions =
  'Extraia somente preferências imobiliárias explicitamente mencionadas. Não invente valores. Retorne JSON com schemaVersion="v1", purpose (SALE, RENT ou null), types (tipos conhecidos), neighborhoods, minPriceCents, maxPriceCents, minBedrooms, maxBedrooms, confidence entre 0 e 1, uncertainty (lista) e needsClarification (boolean). Valores ausentes devem ser null ou listas vazias. Converta valores monetários informais para centavos apenas quando inequívocos. Nunca pesquise imóveis.';

const preferenceExtractionJsonSchema = {
  type: 'object',
  properties: {
    schemaVersion: { type: 'string', enum: ['v1'] },
    purpose: {
      anyOf: [{ type: 'string', enum: ['SALE', 'RENT'] }, { type: 'null' }],
    },
    types: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'],
      },
    },
    neighborhoods: { type: 'array', items: { type: 'string' } },
    minPriceCents: {
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    },
    maxPriceCents: {
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    },
    minBedrooms: {
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    },
    maxBedrooms: {
      anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    uncertainty: { type: 'array', items: { type: 'string' } },
    needsClarification: { type: 'boolean' },
  },
  required: [
    'schemaVersion',
    'purpose',
    'types',
    'neighborhoods',
    'minPriceCents',
    'maxPriceCents',
    'minBedrooms',
    'maxBedrooms',
    'confidence',
    'uncertainty',
    'needsClarification',
  ],
  additionalProperties: false,
} as const;

export abstract class LlmAdapter {
  abstract respond(input: LlmInput): Promise<LlmOutput>;
  abstract extractPreferences(
    message: string,
    options?: ExtractionOptions,
  ): Promise<PreferenceExtractionOutput>;
}

@Injectable()
export class ConfiguredLlmAdapter extends LlmAdapter {
  private readonly client?: OpenAI;
  private readonly model: string;
  private readonly provider: string;
  private readonly timeoutMs: number;
  private readonly extractionMaxOutputTokens: number;

  constructor(config: ConfigService) {
    super();
    this.provider = config.get<string>('AI_PROVIDER', 'mock');
    this.model = configuredModelVersion(config);
    this.timeoutMs = config.get<number>('AI_TIMEOUT_MS', 30000);
    this.extractionMaxOutputTokens = config.get<number>(
      'AI_EXTRACTION_MAX_OUTPUT_TOKENS',
      3000,
    );
    const key = config.get<string>(
      this.provider === 'gemini' ? 'GEMINI_API_KEY' : 'OPENAI_API_KEY',
    );
    if (['openai', 'gemini'].includes(this.provider) && key)
      this.client = new OpenAI({
        apiKey: key,
        ...(this.provider === 'gemini'
          ? {
              baseURL:
                'https://generativelanguage.googleapis.com/v1beta/openai/',
            }
          : {}),
        timeout: this.timeoutMs,
        maxRetries: 0,
      });
  }

  async respond(input: LlmInput): Promise<LlmOutput> {
    if (this.provider === 'mock') return respondDemo(input);
    if (!this.client) {
      return {
        text: 'O assistente está temporariamente indisponível. Posso encaminhar sua solicitação para atendimento manual.',
        calls: [],
        totalTokens: 0,
        output: [],
      };
    }
    if (this.provider === 'gemini') return this.respondWithGemini(input);
    const result = await this.client.responses.create(
      {
        model: this.model,
        ...this.reasoningOptions(),
        instructions: input.instructions,
        input: input.input.map((item) => {
          if (item.type === 'chat_assistant')
            throw new Error('INVALID_ARGUMENTS');
          return item;
        }),
        tools: input.tools.map((tool) => ({
          type: 'function' as const,
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          strict: true,
        })),
        parallel_tool_calls: false,
        store: false,
        include: ['reasoning.encrypted_content'],
        max_output_tokens: input.maxOutputTokens,
      },
      { timeout: input.timeoutMs ?? this.timeoutMs },
    );
    this.requireCompletedResponse(result);
    // Only messages, reasoning and calls to our registered functions are enabled.
    const output = result.output.filter(
      (item) =>
        item.type === 'message' ||
        item.type === 'reasoning' ||
        item.type === 'function_call',
    );
    if (output.length !== result.output.length)
      throw new LlmResponseError(
        'INVALID_MODEL_OUTPUT',
        result.usage?.total_tokens ?? 0,
      );
    const calls = result.output.flatMap((item) =>
      item.type === 'function_call'
        ? [{ callId: item.call_id, name: item.name, arguments: item.arguments }]
        : [],
    );
    if (!result.output_text?.trim() && !calls.length)
      throw new LlmResponseError(
        'AI_EMPTY_OUTPUT',
        result.usage?.total_tokens ?? 0,
      );
    return {
      text: result.output_text ?? '',
      calls,
      totalTokens: result.usage?.total_tokens ?? 0,
      output,
    };
  }

  async extractPreferences(
    message: string,
    options?: ExtractionOptions,
  ): Promise<PreferenceExtractionOutput> {
    if (this.provider === 'mock')
      return {
        json: JSON.stringify(extractDemoPreferences(message)),
        totalTokens: 0,
      };
    if (!this.client) throw new Error('LLM_PROVIDER_UNAVAILABLE');
    if (this.provider === 'gemini')
      return this.extractWithGemini(message, options);
    const result = await this.client.responses.create(
      {
        model: this.model,
        ...this.reasoningOptions(),
        instructions: preferenceExtractionInstructions,
        input: message,
        text: {
          format: {
            type: 'json_schema',
            name: 'preference_extraction_v1',
            strict: true,
            schema: preferenceExtractionJsonSchema,
          },
        },
        store: false,
        max_output_tokens:
          options?.maxOutputTokens ?? this.extractionMaxOutputTokens,
      },
      { timeout: options?.timeoutMs ?? this.timeoutMs },
    );
    this.requireCompletedResponse(result);
    if (!result.output_text?.trim())
      throw new LlmResponseError(
        'AI_EMPTY_OUTPUT',
        result.usage?.total_tokens ?? 0,
      );
    return {
      json: result.output_text ?? '',
      totalTokens: result.usage?.total_tokens ?? 0,
    };
  }

  private async respondWithGemini(input: LlmInput): Promise<LlmOutput> {
    if (!this.client) throw new Error('LLM_PROVIDER_UNAVAILABLE');
    const result = await this.createGeminiCompletion(
      {
        model: this.model,
        ...this.geminiReasoningOptions(),
        messages: [
          { role: 'system', content: input.instructions },
          ...this.toChatMessages(input.input),
        ],
        ...(input.tools.length
          ? {
              tools: input.tools.map((tool) => ({
                type: 'function' as const,
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                },
              })),
              tool_choice: 'auto' as const,
            }
          : {}),
        max_tokens: input.maxOutputTokens,
      },
      input.timeoutMs ?? this.timeoutMs,
    );
    const message = this.requireCompletedChat(result);
    const totalTokens = result.usage?.total_tokens ?? 0;
    const calls = (message.tool_calls ?? []).map((call) => {
      if (call.type !== 'function')
        throw new LlmResponseError('INVALID_MODEL_OUTPUT', totalTokens);
      return {
        callId: call.id,
        name: call.function.name,
        arguments: call.function.arguments,
      };
    });
    if (!message.content?.trim() && !calls.length)
      throw new LlmResponseError('AI_EMPTY_OUTPUT', totalTokens);
    return {
      text: message.content ?? '',
      calls,
      totalTokens,
      output: [
        {
          type: 'chat_assistant',
          message: {
            role: 'assistant',
            content: message.content,
            // Keep complete tool calls: Google can attach thought signatures to them.
            ...(message.tool_calls?.length
              ? { tool_calls: message.tool_calls }
              : {}),
          },
        },
      ],
    };
  }

  private async extractWithGemini(
    message: string,
    options?: ExtractionOptions,
  ): Promise<PreferenceExtractionOutput> {
    if (!this.client) throw new Error('LLM_PROVIDER_UNAVAILABLE');
    const result = await this.createGeminiCompletion(
      {
        model: this.model,
        ...this.geminiReasoningOptions(),
        messages: [
          {
            role: 'system',
            content: preferenceExtractionInstructions,
          },
          { role: 'user', content: message },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'preference_extraction_v1',
            strict: true,
            schema: preferenceExtractionJsonSchema,
          },
        },
        max_tokens: options?.maxOutputTokens ?? this.extractionMaxOutputTokens,
      },
      options?.timeoutMs ?? this.timeoutMs,
    );
    const output = this.requireCompletedChat(result);
    const totalTokens = result.usage?.total_tokens ?? 0;
    if (!output.content?.trim())
      throw new LlmResponseError('AI_EMPTY_OUTPUT', totalTokens);
    return { json: output.content, totalTokens };
  }

  private async createGeminiCompletion(
    body: ChatCompletionCreateParamsNonStreaming,
    timeoutMs: number,
  ): Promise<ChatCompletion> {
    if (!this.client) throw new Error('LLM_PROVIDER_UNAVAILABLE');
    const deadline = performance.now() + timeoutMs;
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.client.chat.completions.create(body, {
          timeout: Math.max(1, Math.ceil(deadline - performance.now())),
        });
      } catch (error) {
        // Retry only explicit unavailability, never orchestration or domain tools.
        if (
          !(error instanceof OpenAI.APIError) ||
          error.status !== 503 ||
          attempt >= 2
        )
          throw error;
        const headers = error.headers as Headers | undefined;
        const retryAfter = headers?.get('retry-after');
        const seconds = retryAfter ? Number(retryAfter) : NaN;
        const retryAfterMs = Number.isFinite(seconds)
          ? Math.max(0, seconds * 1000)
          : retryAfter
            ? Math.max(0, Date.parse(retryAfter) - Date.now())
            : 0;
        const delayMs = Math.max(
          1000 * 2 ** attempt + Math.floor(Math.random() * 250),
          Number.isFinite(retryAfterMs) ? retryAfterMs : 0,
        );
        if (delayMs + 100 >= deadline - performance.now()) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
        if (performance.now() >= deadline) throw error;
      }
    }
  }

  private toChatMessages(items: LlmInputItem[]): ChatCompletionMessageParam[] {
    return items.map((item): ChatCompletionMessageParam => {
      if (item.type === 'chat_assistant') return item.message;
      if (
        item.type === 'function_call_output' &&
        typeof item.call_id === 'string' &&
        typeof item.output === 'string'
      )
        return {
          role: 'tool',
          tool_call_id: item.call_id,
          content: item.output,
        };
      if (
        'role' in item &&
        'content' in item &&
        typeof item.content === 'string'
      ) {
        const role = item.role;
        if (
          role === 'user' ||
          role === 'assistant' ||
          role === 'system' ||
          role === 'developer'
        )
          return { role, content: item.content };
      }
      throw new Error('INVALID_ARGUMENTS');
    });
  }

  private geminiReasoningOptions() {
    if (/^gemini-2\.5-flash(?:-|$)/.test(this.model))
      return { reasoning_effort: 'none' as const };
    if (/^gemini-(?:2\.5-pro|3)/.test(this.model))
      return { reasoning_effort: 'low' as const };
    return {};
  }

  private requireCompletedChat(result: ChatCompletion) {
    const tokens = result.usage?.total_tokens ?? 0;
    const choice = result.choices[0];
    if (!choice) throw new LlmResponseError('AI_EMPTY_OUTPUT', tokens);
    if (choice.finish_reason === 'length')
      throw new LlmResponseError('AI_OUTPUT_TOKEN_LIMIT', tokens);
    if (choice.finish_reason === 'content_filter' || choice.message.refusal)
      throw new LlmResponseError('AI_MODEL_REFUSAL', tokens);
    if (!['stop', 'tool_calls'].includes(choice.finish_reason))
      throw new LlmResponseError('AI_MODEL_INCOMPLETE', tokens);
    return choice.message;
  }

  private reasoningOptions() {
    // This model requires reasoning; low effort suits extraction and short tool turns.
    return /^gpt-6\.1-sol(?:-|$)/.test(this.model)
      ? { reasoning: { effort: 'low' as const } }
      : {};
  }

  private requireCompletedResponse(result: Response) {
    const tokens = result.usage?.total_tokens ?? 0;
    if (result.status === 'incomplete') {
      throw new LlmResponseError(
        result.incomplete_details?.reason === 'max_output_tokens'
          ? 'AI_OUTPUT_TOKEN_LIMIT'
          : 'AI_MODEL_INCOMPLETE',
        tokens,
      );
    }
    if (result.status !== 'completed')
      throw new LlmResponseError('AI_PROVIDER_RESPONSE_FAILED', tokens);
    if (
      result.output.some(
        (item) =>
          item.type === 'message' &&
          item.content.some((part) => part.type === 'refusal'),
      )
    )
      throw new LlmResponseError('AI_MODEL_REFUSAL', tokens);
  }
}

export const TOOL_SCHEMAS: ToolDefinition[] = [
  {
    name: 'create_lead',
    description: 'Cria um lead com nome e contato fornecido.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
      },
      required: ['name', 'email', 'phone'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_lead',
    description: 'Consulta um lead autorizado da conversa.',
    parameters: {
      type: 'object',
      properties: { leadId: { type: 'string' } },
      required: ['leadId'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_lead_preferences',
    description:
      'Atualiza preferências explicitamente informadas para o lead da conversa.',
    parameters: {
      type: 'object',
      properties: {
        purposes: {
          type: 'array',
          items: { type: 'string', enum: ['SALE', 'RENT'] },
        },
        types: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL'],
          },
        },
        neighborhoods: { type: 'array', items: { type: 'string' } },
        minPriceCents: { type: ['integer', 'null'] },
        maxPriceCents: { type: ['integer', 'null'] },
        minBedrooms: { type: ['integer', 'null'] },
        maxBedrooms: { type: ['integer', 'null'] },
        notes: { type: ['string', 'null'] },
      },
      required: [
        'purposes',
        'types',
        'neighborhoods',
        'minPriceCents',
        'maxPriceCents',
        'minBedrooms',
        'maxBedrooms',
        'notes',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'search_properties',
    description: 'Busca imóveis reais do corretor usando filtros objetivos.',
    parameters: {
      type: 'object',
      properties: {
        purpose: { type: ['string', 'null'], enum: ['SALE', 'RENT', null] },
        type: {
          type: ['string', 'null'],
          enum: ['APARTMENT', 'HOUSE', 'LAND', 'COMMERCIAL', null],
        },
        neighborhood: { type: ['string', 'null'] },
        minPriceCents: { type: ['integer', 'null'] },
        maxPriceCents: { type: ['integer', 'null'] },
        minBedrooms: { type: ['integer', 'null'] },
      },
      required: [
        'purpose',
        'type',
        'neighborhood',
        'minPriceCents',
        'maxPriceCents',
        'minBedrooms',
      ],
      additionalProperties: false,
    },
  },
  {
    name: 'get_property_details',
    description: 'Consulta detalhes de imóvel autorizado.',
    parameters: {
      type: 'object',
      properties: { propertyId: { type: 'string' } },
      required: ['propertyId'],
      additionalProperties: false,
    },
  },
  {
    name: 'save_property_interest',
    description: 'Registra interesse do lead em imóvel autorizado.',
    parameters: {
      type: 'object',
      properties: { propertyId: { type: 'string' } },
      required: ['propertyId'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_available_visit_slots',
    description: 'Lista horários livres para visita nos próximos 14 dias.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: { type: 'string' },
        durationMinutes: { type: 'integer' },
      },
      required: ['propertyId', 'durationMinutes'],
      additionalProperties: false,
    },
  },
  {
    name: 'schedule_visit',
    description: 'Cria uma proposta de visita pendente de confirmação humana.',
    parameters: {
      type: 'object',
      properties: {
        propertyId: { type: 'string' },
        startAt: { type: 'string' },
        endAt: { type: 'string' },
      },
      required: ['propertyId', 'startAt', 'endAt'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_follow_up_task',
    description: 'Cria tarefa de acompanhamento para o lead da conversa.',
    parameters: {
      type: 'object',
      properties: { title: { type: 'string' }, dueAt: { type: 'string' } },
      required: ['title', 'dueAt'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_pending_tasks',
    description: 'Lista tarefas pendentes do corretor.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'draft_follow_up_message',
    description:
      'Prepara uma sugestão de mensagem de acompanhamento sem enviá-la.',
    parameters: {
      type: 'object',
      properties: { purpose: { type: 'string' } },
      required: ['purpose'],
      additionalProperties: false,
    },
  },
];
