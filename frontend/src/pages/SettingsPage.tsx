import { useState } from 'react';
import { useSession } from '../lib/session';
import {
  PageHeader,
  Card,
  Icon,
  Avatar,
  Badge,
  Button,
} from '../components/ui';
export default function SettingsPage() {
  const { user, logout } = useSession();
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const operator = user!.permissions.includes('operations:read');
  const permissions = [
    [
      'Gestão dos próprios leads e imóveis',
      'Cadastro, edição e movimentação no pipeline particular.',
      true,
    ],
    [
      'Agenda e tarefas pessoais',
      'Organização de visitas e próximos contatos.',
      true,
    ],
    [
      'Assistente contextual aos próprios leads',
      'Sugestões revisadas antes de qualquer confirmação.',
      true,
    ],
    [
      'Consulta global de processamentos e métricas',
      'Visão operacional do ambiente.',
      operator,
    ],
    [
      'Reenvio operacional de jobs',
      'Replay de processamentos que falharam.',
      user!.permissions.includes('operations:replay'),
    ],
  ] as const;
  return (
    <div className="page-stack">
      <PageHeader
        title="Configurações"
        subtitle="Gerenciamento de conta, permissões e comportamento da sessão."
      />
      <div className="grid-2">
        <Card>
          <div className="section-title">
            <h2>
              <Icon name="person" /> Minha conta
            </h2>
            <Badge>Somente leitura</Badge>
          </div>
          <div className="detail-summary">
            <Avatar name={user!.name} />
            <div>
              <h3>{user?.name}</h3>
              <p className="muted small">{user?.email}</p>
              <Badge tone="primary">
                {user?.role === 'OPERATOR' ? 'Operador' : 'Corretor'}
              </Badge>
            </div>
          </div>
          <div className="divider" />
          <dl className="definition-list">
            <div className="full-width">
              <dt>Identificador da conta</dt>
              <dd className="status-line" style={{ overflowWrap: 'anywhere' }}>
                {user?.id}
                <button
                  className="icon-button"
                  aria-label="Copiar identificador"
                  onClick={() =>
                    void navigator.clipboard.writeText(user!.id).then(
                      () => {
                        setCopied(true);
                        setCopyError(false);
                      },
                      () => setCopyError(true),
                    )
                  }
                >
                  <Icon name="content_copy" size={14} />
                </button>
              </dd>
            </div>
            <div>
              <dt>Papel operacional</dt>
              <dd>
                {operator
                  ? 'Operador de suporte & negócios'
                  : 'Corretor autônomo'}
              </dd>
            </div>
            <div>
              <dt>CRECI declarado</dt>
              <dd>{user?.creci ?? 'Não informado'}</dd>
            </div>
          </dl>
          <div className="grid-3" style={{ marginTop: 24 }}>
            {[
              ['Leads ativos', user?.summary?.leads],
              ['Imóveis vinculados', user?.summary?.properties],
              ['Visitas agendadas', user?.summary?.visits],
            ].map(([label, value]) => (
              <div key={label} className="notice" style={{ display: 'block' }}>
                <p className="label">{label}</p>
                <strong className="metric-value">{value ?? '—'}</strong>
              </div>
            ))}
          </div>
          <div className="notice" style={{ marginTop: 20 }}>
            <Icon name="verified_user" />
            <p>
              Os dados da conta estão disponíveis para consulta nesta versão.
              Alterações cadastrais e credenciais são administradas fora da
              interface.
            </p>
          </div>
          {copied && (
            <p
              role="status"
              className="success-panel"
              style={{ marginTop: 12 }}
            >
              Identificador copiado.
            </p>
          )}
          {copyError && (
            <p role="alert" className="field-error">
              O navegador não permitiu copiar. Selecione o identificador
              manualmente.
            </p>
          )}
        </Card>
        <Card>
          <div className="section-title">
            <h2>
              <Icon name="verified_user" /> Acesso & Sessão
            </h2>
            <Badge tone="primary">
              {operator ? 'Políticas operador' : 'Perfil corretor'}
            </Badge>
          </div>
          <div className="stack" style={{ gap: 20 }}>
            {permissions.map(([title, description, enabled]) => (
              <div key={title} style={{ display: 'flex', gap: 12 }}>
                <span className={enabled ? 'text-success' : 'muted'}>
                  <Icon name={enabled ? 'check' : 'close'} />
                </span>
                <div>
                  <strong className="small">{title}</strong>
                  <p className="small muted" style={{ marginTop: 4 }}>
                    {enabled ? description : 'Não disponível para este perfil.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="divider" />
          <h3>Sessão atual</h3>
          <p className="small muted" style={{ marginTop: 12 }}>
            Recarregar a página exige um novo login. Ao sair, token e dados
            desta sessão são descartados.
          </p>
          <div className="notice" style={{ margin: '16px 0' }}>
            <Icon name="lock" />
            Nenhum token ou chave de infraestrutura fica em armazenamento
            persistente.
          </div>
          <Button variant="danger" onClick={logout}>
            <Icon name="logout" />
            Sair da conta
          </Button>
        </Card>
      </div>
    </div>
  );
}
