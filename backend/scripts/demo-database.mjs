export function demoDatabaseURL() {
  const url = new URL(
    process.env.DATABASE_URL_DEMO ??
      process.env.DATABASE_URL ??
      'postgresql://copilot:local_only_change_me@localhost:5432/corretor_copilot_demo',
  );
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Demonstração exige PostgreSQL local.');
  if (
    process.env.DATABASE_URL_DEMO &&
    url.pathname !== '/corretor_copilot_demo'
  )
    throw new Error('DATABASE_URL_DEMO deve usar corretor_copilot_demo.');
  if (process.env.NODE_ENV === 'production')
    throw new Error('Demonstração não pode executar em produção.');
  url.pathname = '/corretor_copilot_demo';
  url.searchParams.set('schema', 'public');
  return url.toString();
}
