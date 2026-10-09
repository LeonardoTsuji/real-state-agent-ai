import { ConfigService } from '@nestjs/config';
import { APIConnectionTimeoutError } from 'openai';
import {
  ConfiguredLlmAdapter,
  LlmResponseError,
  TOOL_SCHEMAS,
  configuredModelVersion,
} from './llm.adapter.js';

const jest = (import.meta as ImportMeta & { jest: typeof globalThis.jest })
  .jest;

function requestBody(body: RequestInit['body']): unknown {
  if (typeof body !== 'string') throw new Error('Expected JSON request body');
  return JSON.parse(body) as unknown;
}

describe('ConfiguredLlmAdapter provider integration', () => {
  const createAdapter = (overrides: Record<string, unknown> = {}) => {
    const values: Record<string, unknown> = {
      AI_PROVIDER: 'openai',
      OPENAI_MODEL: 'gpt-6.1-sol',
      OPENAI_API_KEY: 'synthetic-test-key',
      ...overrides,
    };
    return new ConfiguredLlmAdapter({
      get: (key: string, fallback?: unknown) => values[key] ?? fallback,
    } as ConfigService);
  };

  const apiResponse = (overrides: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({
        id: 'resp_test',
        object: 'response',
        status: 'completed',
        usage: { total_tokens: 120 },
        output: [
          {
            id: 'msg_test',
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [
              {
                type: 'output_text',
                text: '{"schemaVersion":"v1"}',
                annotations: [],
              },
            ],
          },
        ],
        ...overrides,
      }),
      { headers: { 'content-type': 'application/json' } },
    );

  const geminiAdapter = (overrides: Record<string, unknown> = {}) =>
    createAdapter({
      AI_PROVIDER: 'gemini',
      GEMINI_API_KEY: 'synthetic-google-key',
      ...overrides,
    });
  const chatResponse = (choice: Record<string, unknown> = {}) =>
    new Response(
      JSON.stringify({
        id: 'chatcmpl_test',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"schemaVersion":"v1"}' },
            ...choice,
          },
        ],
        usage: { total_tokens: 120 },
      }),
      { headers: { 'content-type': 'application/json' } },
    );

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('sends a strict JSON schema and a configurable reasoning budget for gpt-6.1-sol', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(apiResponse());
    const output = await createAdapter().extractPreferences('Quero alugar');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api.openai.com/v1/responses',
    );
    const request = requestBody(fetch.mock.calls[0]?.[1]?.body);
    expect(request).toMatchObject({
      model: 'gpt-6.1-sol',
      reasoning: { effort: 'low' },
      max_output_tokens: 3000,
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    expect(output.totalTokens).toBe(120);
  });

  it('does not send reasoning parameters to gpt-4.1-mini', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(apiResponse());
    await createAdapter({ OPENAI_MODEL: 'gpt-4.1-mini' }).extractPreferences(
      'Quero alugar',
    );
    const request = requestBody(fetch.mock.calls[0]?.[1]?.body);
    expect(request).not.toHaveProperty('reasoning');
  });

  it('distinguishes output truncation and preserves billed usage', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      apiResponse({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
        usage: { total_tokens: 321 },
      }),
    );
    await expect(
      createAdapter().extractPreferences('Quero alugar'),
    ).rejects.toMatchObject({
      message: 'AI_OUTPUT_TOKEN_LIMIT',
      totalTokens: 321,
    });
  });

  it('does not execute partial function calls from an incomplete response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      apiResponse({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [
          {
            type: 'function_call',
            call_id: 'call_test',
            name: 'create_lead',
            arguments: '{',
          },
        ],
      }),
    );
    await expect(
      createAdapter().respond({
        instructions: 'Use tools',
        input: [],
        tools: TOOL_SCHEMAS,
        maxOutputTokens: 1200,
      }),
    ).rejects.toBeInstanceOf(LlmResponseError);
  });

  it('preserves encrypted reasoning and the original function call for replay', async () => {
    const output = [
      {
        id: 'rs_test',
        type: 'reasoning',
        summary: [],
        encrypted_content: 'synthetic-encrypted-reasoning',
      },
      {
        id: 'fc_test',
        type: 'function_call',
        call_id: 'call_test',
        name: 'list_pending_tasks',
        arguments: '{}',
      },
    ];
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(apiResponse({ output }));
    const result = await createAdapter().respond({
      instructions: 'Use tools',
      input: [],
      tools: TOOL_SCHEMAS,
      maxOutputTokens: 1200,
    });
    expect(result.output).toEqual(output);
    expect(result.calls).toEqual([
      { callId: 'call_test', name: 'list_pending_tasks', arguments: '{}' },
    ]);
    const request = requestBody(fetch.mock.calls[0]?.[1]?.body);
    expect(request).toMatchObject({ include: ['reasoning.encrypted_content'] });
  });

  it('reports refusals separately from invalid JSON', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      apiResponse({
        output: [
          {
            type: 'message',
            content: [{ type: 'refusal', refusal: 'synthetic refusal' }],
          },
        ],
      }),
    );
    await expect(
      createAdapter().extractPreferences('Quero alugar'),
    ).rejects.toMatchObject({ message: 'AI_MODEL_REFUSAL', totalTokens: 120 });
  });

  it('rejects an empty completed response', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(apiResponse({ output: [] }));
    await expect(
      createAdapter().extractPreferences('Quero alugar'),
    ).rejects.toMatchObject({ message: 'AI_EMPTY_OUTPUT', totalTokens: 120 });
  });

  it('aborts the HTTP request at the configured timeout without automatic retries', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })),
          );
        }),
    );
    await expect(
      createAdapter({ AI_TIMEOUT_MS: 20 }).extractPreferences('Quero alugar'),
    ).rejects.toBeInstanceOf(APIConnectionTimeoutError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not retry provider errors outside the reserved token budget', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { message: 'synthetic failure', code: 'server_error' },
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(
      createAdapter().extractPreferences('Quero alugar'),
    ).rejects.toHaveProperty('status', 500);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('routes Gemini extraction to Google with the Gemini key, model and JSON schema', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(chatResponse());
    const result = await geminiAdapter().extractPreferences('Quero alugar', {
      maxOutputTokens: 900,
      timeoutMs: 30000,
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    );
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization'),
    ).toBe('Bearer synthetic-google-key');
    const request = requestBody(fetch.mock.calls[0]?.[1]?.body);
    expect(request).toMatchObject({
      model: 'gemini-2.5-flash',
      reasoning_effort: 'none',
      max_tokens: 900,
      response_format: {
        type: 'json_schema',
        json_schema: { strict: true, name: 'preference_extraction_v1' },
      },
      messages: [{ role: 'system' }, { role: 'user', content: 'Quero alugar' }],
    });
    expect(request).not.toHaveProperty('include');
    expect(request).not.toHaveProperty('store');
    expect(result).toEqual({
      json: '{"schemaVersion":"v1"}',
      totalTokens: 120,
    });
  });

  it('uses the configured Gemini model for calls and telemetry', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(chatResponse());
    await geminiAdapter({
      GEMINI_MODEL: 'gemini-3.8-flash',
    }).extractPreferences('Quero alugar');
    expect(requestBody(fetch.mock.calls[0]?.[1]?.body)).toMatchObject({
      model: 'gemini-3.8-flash',
      reasoning_effort: 'low',
    });
    const values: Record<string, unknown> = {
      AI_PROVIDER: 'gemini',
      GEMINI_MODEL: 'gemini-3.8-flash',
      OPENAI_MODEL: 'unused-openai-model',
    };
    expect(
      configuredModelVersion({
        get: (key: string, fallback?: unknown) => values[key] ?? fallback,
      } as ConfigService),
    ).toBe('gemini-3.8-flash');
  });

  it('returns Google tool calls and replays their signatures with all tool results', async () => {
    const toolCalls = [
      {
        type: 'function',
        id: 'call_a',
        function: { name: 'list_pending_tasks', arguments: '{}' },
        extra_content: { google: { thought_signature: 'synthetic-signature' } },
      },
      {
        type: 'function',
        id: 'call_b',
        function: { name: 'get_lead', arguments: '{"leadId":"lead-id"}' },
      },
    ];
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        chatResponse({
          finish_reason: 'tool_calls',
          message: { role: 'assistant', content: null, tool_calls: toolCalls },
        }),
      )
      .mockResolvedValueOnce(
        chatResponse({
          message: { role: 'assistant', content: 'Sem tarefas pendentes.' },
        }),
      );
    const adapter = geminiAdapter();
    const input = {
      instructions: 'Use tools',
      input: [{ role: 'user' as const, content: 'Liste minhas tarefas' }],
      tools: TOOL_SCHEMAS,
      maxOutputTokens: 1200,
    };
    const first = await adapter.respond(input);
    expect(first.calls).toEqual([
      { callId: 'call_a', name: 'list_pending_tasks', arguments: '{}' },
      { callId: 'call_b', name: 'get_lead', arguments: '{"leadId":"lead-id"}' },
    ]);
    const second = await adapter.respond({
      ...input,
      input: [
        ...input.input,
        ...first.output,
        {
          type: 'function_call_output',
          call_id: 'call_a',
          output: '{"items":[]}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_b',
          output: '{"name":"Lead sintético"}',
        },
      ],
    });
    expect(second.text).toBe('Sem tarefas pendentes.');
    expect(requestBody(fetch.mock.calls[1]?.[1]?.body)).toMatchObject({
      messages: [
        { role: 'system', content: 'Use tools' },
        { role: 'user', content: 'Liste minhas tarefas' },
        { role: 'assistant', content: null, tool_calls: toolCalls },
        { role: 'tool', tool_call_id: 'call_a', content: '{"items":[]}' },
        {
          role: 'tool',
          tool_call_id: 'call_b',
          content: '{"name":"Lead sintético"}',
        },
      ],
    });
  });

  it.each(['length', 'content_filter'])(
    'rejects Gemini responses ending in %s before exposing partial tools',
    async (finishReason) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        chatResponse({
          finish_reason: finishReason,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                type: 'function',
                id: 'call_partial',
                function: { name: 'create_lead', arguments: '{' },
              },
            ],
          },
        }),
      );
      await expect(
        geminiAdapter().respond({
          instructions: 'Use tools',
          input: [],
          tools: TOOL_SCHEMAS,
          maxOutputTokens: 1200,
        }),
      ).rejects.toMatchObject({
        message:
          finishReason === 'length'
            ? 'AI_OUTPUT_TOKEN_LIMIT'
            : 'AI_MODEL_REFUSAL',
        totalTokens: 120,
      });
    },
  );

  it('rejects empty Gemini extraction responses', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        chatResponse({ message: { role: 'assistant', content: '' } }),
      );
    await expect(
      geminiAdapter().extractPreferences('Quero alugar'),
    ).rejects.toMatchObject({ message: 'AI_EMPTY_OUTPUT', totalTokens: 120 });
  });

  it('propagates Gemini quota errors without automatic retries', async () => {
    const quotaResponse = new Response(
      JSON.stringify({
        error: {
          code: 429,
          status: 'RESOURCE_EXHAUSTED',
          message: 'synthetic quota limit',
        },
      }),
      { status: 429, headers: { 'content-type': 'application/json' } },
    );
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(quotaResponse);
    await expect(
      geminiAdapter().extractPreferences('Quero alugar'),
    ).rejects.toHaveProperty('status', 429);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  const unavailableResponse = (headers: Record<string, string> = {}) =>
    new Response(
      JSON.stringify({ error: { message: 'synthetic unavailability' } }),
      {
        status: 503,
        headers: { 'content-type': 'application/json', ...headers },
      },
    );

  it('recovers from Gemini 503 with bounded backoff and identical requests', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(unavailableResponse())
      .mockResolvedValueOnce(unavailableResponse())
      .mockResolvedValueOnce(chatResponse());
    const started = performance.now();
    const pending = geminiAdapter().extractPreferences('Quero alugar');
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ totalTokens: 120 });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(performance.now() - started).toBe(3000);
    const firstBody = fetch.mock.calls[0]?.[1]?.body;
    expect(fetch.mock.calls[1]?.[1]?.body).toBe(firstBody);
    expect(fetch.mock.calls[2]?.[1]?.body).toBe(firstBody);
  });

  it('propagates persistent Gemini 503 after three attempts', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(unavailableResponse()));
    const assertion = expect(
      geminiAdapter().respond({
        instructions: 'Use tools',
        input: [],
        tools: TOOL_SCHEMAS,
        maxOutputTokens: 1200,
      }),
    ).rejects.toHaveProperty('status', 503);
    await jest.runAllTimersAsync();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('respects Retry-After without retrying past the total timeout', async () => {
    jest.useFakeTimers();
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(unavailableResponse({ 'retry-after': '2' })),
      );
    const assertion = expect(
      geminiAdapter().extractPreferences('Quero alugar', {
        maxOutputTokens: 900,
        timeoutMs: 1500,
      }),
    ).rejects.toHaveProperty('status', 503);
    await jest.runAllTimersAsync();
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('waits for Retry-After before retrying Gemini', async () => {
    jest.useFakeTimers();
    jest.spyOn(Math, 'random').mockReturnValue(0);
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(unavailableResponse({ 'retry-after': '3' }))
      .mockResolvedValueOnce(chatResponse());
    const started = performance.now();
    const pending = geminiAdapter().extractPreferences('Quero alugar');
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ totalTokens: 120 });
    expect(performance.now() - started).toBe(3000);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
