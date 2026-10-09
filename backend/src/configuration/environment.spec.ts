import { validateEnvironment } from './environment.js';

describe('validateEnvironment', () => {
  const validEnvironment = {
    DATABASE_URL: 'postgresql://copilot:secret@localhost:5432/copilot',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a-secret-that-is-at-least-thirty-two-characters',
  };

  it('applies safe defaults to optional settings', () => {
    expect(validateEnvironment(validEnvironment)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      JWT_EXPIRES_IN_SECONDS: 3600,
    });
  });

  it('fails with variable names when required configuration is invalid', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, JWT_SECRET: 'short' }),
    ).toThrow(/JWT_SECRET/);
  });

  it('rejects URLs with unsupported protocols', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, DATABASE_URL: 'http://db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('keeps the LLM offline by default and requires an API key when enabled', () => {
    expect(validateEnvironment(validEnvironment).AI_PROVIDER).toBe('mock');
    expect(() =>
      validateEnvironment({ ...validEnvironment, AI_PROVIDER: 'openai' }),
    ).toThrow(/OPENAI_API_KEY/);
    expect(
      validateEnvironment({
        ...validEnvironment,
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'backend-only-test-key',
      }).AI_PROVIDER,
    ).toBe('openai');
  });

  it('accepts Gemini with its own key and model without requiring an OpenAI key', () => {
    expect(() =>
      validateEnvironment({ ...validEnvironment, AI_PROVIDER: 'gemini' }),
    ).toThrow(/GEMINI_API_KEY/);
    expect(
      validateEnvironment({
        ...validEnvironment,
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'synthetic-google-key',
      }),
    ).toMatchObject({
      AI_PROVIDER: 'gemini',
      GEMINI_MODEL: 'gemini-2.5-flash',
    });
  });
});
