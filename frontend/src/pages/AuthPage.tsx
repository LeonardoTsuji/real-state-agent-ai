import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, useSession } from '../lib/session';
import { Button, Field, Icon, ErrorPanel } from '../components/ui';
const loginSchema = z.object({
  email: z.email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
const registerSchema = loginSchema
  .extend({
    name: z.string().trim().min(1, 'Informe seu nome.').max(120),
    password: z.string().min(12, 'Use pelo menos 12 caracteres.').max(128),
    confirm: z.string(),
  })
  .refine((x) => x.password === x.confirm, {
    path: ['confirm'],
    message: 'As senhas não coincidem.',
  });
type Fields = {
  email: string;
  password: string;
  name?: string;
  confirm?: string;
};
export default function AuthPage() {
  const location = useLocation();
  const signup = location.pathname === '/cadastro';
  const navigate = useNavigate();
  const { login } = useSession();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Fields>({
    resolver: zodResolver(signup ? registerSchema : loginSchema) as never,
  });
  const submit = async (data: Fields) => {
    setError(null);
    try {
      if (signup) {
        await api.post('/auth/register', {
          name: data.name,
          email: data.email,
          password: data.password,
        });
        setSuccess(true);
        navigate('/login');
      } else {
        await login(data.email, data.password);
        const back = new URLSearchParams(location.search).get('retorno');
        navigate(
          back &&
            back.startsWith('/') &&
            !back.startsWith('//') &&
            !back.startsWith('/login')
            ? back
            : '/leads',
          { replace: true },
        );
      }
    } catch (e) {
      setError(e);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-container">
        <Link to="/login" className="brand auth-brand">
          <span className="brand-icon">
            <Icon name="auto_awesome" size={24} />
          </span>
          <div>
            <strong>Corretor Copilot</strong>
            <small>INTELIGÊNCIA IMOBILIÁRIA</small>
          </div>
        </Link>
        <section className="auth-card">
          <h1>Acesse o Corretor Copilot</h1>
          <p className="auth-description">
            CRM inteligente com IA integrada para corretores de imóveis
            autônomos.
          </p>
          <div className="auth-tabs">
            <Link className={!signup ? 'active' : ''} to="/login">
              Entrar
            </Link>
            <Link className={signup ? 'active' : ''} to="/cadastro">
              Cadastrar-se
            </Link>
          </div>
          {error != null && <ErrorPanel error={error} />}
          {success && (
            <p role="status" className="success-panel">
              Cadastro concluído. Entre com suas credenciais.
            </p>
          )}
          <form
            className="auth-form"
            onSubmit={handleSubmit(submit)}
            noValidate
          >
            {signup && (
              <Field label="Nome completo" error={errors.name?.message}>
                <input autoComplete="name" {...register('name')} />
              </Field>
            )}
            <Field label="E-mail profissional" error={errors.email?.message}>
              <input
                type="email"
                autoComplete="email"
                placeholder="seu@email.com.br"
                {...register('email')}
              />
            </Field>
            <Field
              label={signup ? 'Criar senha' : 'Senha de acesso'}
              error={errors.password?.message}
            >
              <span className="password-wrap">
                <input
                  type={visible ? 'text' : 'password'}
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  {...register('password')}
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
                  onClick={() => setVisible(!visible)}
                >
                  <Icon name="visibility" />
                </button>
              </span>
            </Field>
            {signup && (
              <>
                <Field label="Confirmar senha" error={errors.confirm?.message}>
                  <input
                    type={visible ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...register('confirm')}
                  />
                </Field>
                <p className="small muted">
                  Use pelo menos 12 caracteres. Os dados da sessão ficam apenas
                  em memória.
                </p>
              </>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Icon name="progress_activity" className="spin" />
              ) : (
                <Icon name={signup ? 'person' : 'lock'} />
              )}{' '}
              {signup ? 'Finalizar cadastro' : 'Entrar no Corretor Copilot'}
            </Button>
          </form>
        </section>
        <p className="auth-footer">
          Sua carteira, agenda e decisões em um só lugar.
        </p>
        <div className="auth-meta">
          <Icon name="auto_awesome" size={13} /> Ambiente de estudo ·
          Integrações simuladas
        </div>
      </div>
    </main>
  );
}
