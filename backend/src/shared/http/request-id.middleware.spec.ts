import { RequestIdMiddleware } from './request-id.middleware.js';

describe('RequestIdMiddleware', () => {
  it('accepts only bounded safe correlation IDs', () => {
    const middleware = new RequestIdMiddleware();
    const captured: Array<{ id: string; responseId: string }> = [];
    const run = (input: string | undefined) => {
      let assigned = '';
      const request = {
        header: () => input,
        set requestId(value: string) {
          assigned = value;
        },
      };
      const response = {
        setHeader: (_name: string, value: string) =>
          captured.push({ id: assigned, responseId: value }),
      };
      middleware.use(request as never, response as never, () => undefined);
      return captured.at(-1)!;
    };
    expect(run('valid-Request_42')).toEqual({
      id: 'valid-Request_42',
      responseId: 'valid-Request_42',
    });
    const rejected = run('bad\nvalue');
    expect(rejected.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(rejected.responseId).toBe(rejected.id);
  });
});
