import Joi from 'joi';

const environmentSchema = Joi.object<Record<string, unknown>>({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DEMO_MODE: Joi.boolean().truthy('1').falsy('0').default(false),
  WORKFLOW_QUEUE_NAME: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('real-state-workflows'),
  PROCESS_ROLE: Joi.string().valid('all', 'api', 'worker').default('all'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).max(10).default(0),
  HTTP_BODY_LIMIT: Joi.string()
    .pattern(/^\d+(?:b|kb|mb)$/i)
    .default('100kb'),
  HTTP_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(300000)
    .default(30000),
  HTTP_HEADERS_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(60000)
    .default(15000),
  RATE_LIMIT_WINDOW_MS: Joi.number()
    .integer()
    .min(1000)
    .max(3600000)
    .default(60000),
  RATE_LIMIT_IP_MAX: Joi.number().integer().min(1).max(100000).default(120),
  RATE_LIMIT_USER_MAX: Joi.number().integer().min(1).max(100000).default(300),
  RATE_LIMIT_AI_USER_MAX: Joi.number().integer().min(1).max(10000).default(20),
  AI_DAILY_TOKEN_LIMIT: Joi.number()
    .integer()
    .min(100)
    .max(10000000)
    .default(100000),
  AI_DAILY_REQUEST_LIMIT: Joi.number()
    .integer()
    .min(1)
    .max(100000)
    .default(200),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_EXPIRES_IN_SECONDS: Joi.number().integer().positive().default(3600),
  QUEUE_MAX_ATTEMPTS: Joi.number().integer().min(1).max(20).default(5),
  QUEUE_RETRY_DELAY_MS: Joi.number()
    .integer()
    .min(100)
    .max(60000)
    .default(1000),
  QUEUE_JOB_TIMEOUT_MS: Joi.number()
    .integer()
    .min(100)
    .max(300000)
    .default(15000),
  QUEUE_CONCURRENCY: Joi.number().integer().min(1).max(100).default(5),
  QUEUE_RATE_MAX: Joi.number().integer().min(1).max(10000).default(30),
  QUEUE_RATE_DURATION_MS: Joi.number()
    .integer()
    .min(100)
    .max(60000)
    .default(1000),
  SIMULATED_CALENDAR_MODE: Joi.string()
    .valid('success', 'timeout', 'transient_failure', 'permanent_failure')
    .default('success'),
  SIMULATED_MESSAGING_MODE: Joi.string()
    .valid('success', 'timeout', 'transient_failure', 'permanent_failure')
    .default('success'),
  AI_PROVIDER: Joi.string().valid('mock', 'openai', 'gemini').default('mock'),
  OPENAI_API_KEY: Joi.when('AI_PROVIDER', {
    is: 'openai',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  OPENAI_MODEL: Joi.string().default('gpt-4.1-mini'),
  GEMINI_API_KEY: Joi.when('AI_PROVIDER', {
    is: 'gemini',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GEMINI_MODEL: Joi.string().default('gemini-2.5-flash'),
  AI_MAX_ITERATIONS: Joi.number().integer().min(1).max(10).default(4),
  AI_MAX_TOOL_CALLS: Joi.number().integer().min(1).max(20).default(8),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  AI_MAX_OUTPUT_TOKENS: Joi.number().integer().min(100).max(8000).default(1200),
  AI_EXTRACTION_MAX_OUTPUT_TOKENS: Joi.number()
    .integer()
    .min(100)
    .max(8000)
    .default(3000),
  AI_MAX_TOTAL_TOKENS: Joi.number().integer().min(100).max(50000).default(5000),
  AI_MAX_CONTEXT_CHARS: Joi.number()
    .integer()
    .min(1000)
    .max(50000)
    .default(14000),
  AI_MESSAGE_RETENTION_DAYS: Joi.number()
    .integer()
    .min(1)
    .max(3650)
    .default(365),
}).unknown(true);

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const result = environmentSchema.validate(environment, {
    abortEarly: false,
    convert: true,
  });

  if (result.error) {
    const issues = result.error.details.map(({ message, path }) => {
      const key = path.join('.');
      return `${key || 'environment'}: ${message}`;
    });
    throw new Error(`Invalid environment configuration: ${issues.join('; ')}`);
  }

  return result.value;
}
