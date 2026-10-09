import { lazy, Suspense, useEffect, useState } from "react";
import {
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useSession } from "./lib/session";
import { Button, Icon, Avatar, Loading, Modal } from "./components/ui";
import AuthPage from "./pages/AuthPage";
const LeadsPage = lazy(() => import("./pages/LeadsPage"));
const LeadDetailPage = lazy(() => import("./pages/LeadDetailPage"));
const PropertiesPage = lazy(() => import("./pages/PropertiesPage"));
const PropertyDossierPage = lazy(() => import("./pages/PropertyDossierPage"));
const AgendaPage = lazy(() => import("./pages/AgendaPage"));
const VisitPage = lazy(() => import("./pages/VisitPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const PipelinePage = lazy(() => import("./pages/PipelinePage"));
const CommercialPage = lazy(() => import("./pages/CommercialPage"));
const DocumentPage = lazy(() => import("./pages/DocumentPage"));
const OperationsPage = lazy(() => import("./pages/OperationsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
function Protected() {
  const { user } = useSession();
  const location = useLocation();
  return user ? (
    <Shell />
  ) : (
    <Navigate
      to={`/login?retorno=${encodeURIComponent(location.pathname + location.search)}`}
      replace
    />
  );
}
function Shell() {
  const { user, logout } = useSession();
  const [menu, setMenu] = useState(false);
  const [profile, setProfile] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const nav = [
    ["/leads", "person_search", "Leads"],
    ["/funil", "view_kanban", "Funil de Vendas"],
    ["/imoveis", "apartment", "Imóveis"],
    ["/agenda", "calendar_today", "Agenda"],
    ["/tarefas", "task_alt", "Tarefas"],
  ];
  return (
    <>
      {menu && (
        <div
          className="sidebar-overlay"
          onClick={() => setMenu(false)}
          aria-hidden="true"
        />
      )}
      <aside className={`app-sidebar ${menu ? "open" : ""}`}>
        <NavLink to="/leads" className="brand">
          <span className="brand-icon">
            <Icon name="neurology" size={23} />
          </span>
          <div>
            <strong>Corretor Copilot</strong>
            <small>Inteligência Imobiliária</small>
          </div>
        </NavLink>
        <div>
          <div className="nav-label">Operação</div>
          <nav className="app-nav">
            {nav.map(([to, icon, label]) => (
              <NavLink
                key={to}
                to={to!}
                onClick={() => setMenu(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon name={icon!} />
                <span>{label}</span>
                {to === "/leads" && user?.summary && (
                  <span className="nav-count">{user.summary.leads}</span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div>
          <div className="nav-label">Gestão & Sistema</div>
          <nav className="app-nav">
            {user?.permissions.includes("operations:read") && (
              <NavLink
                to="/operacoes/jobs"
                onClick={() => setMenu(false)}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <Icon name="analytics" />
                <span>Operações</span>
              </NavLink>
            )}
            <NavLink
              to="/configuracoes"
              onClick={() => setMenu(false)}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon name="settings" />
              <span>Configurações</span>
            </NavLink>
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="copilot-status">
            <span className="status-dot" /> Copilot · Demonstração{" "}
            <small>LOCAL</small>
          </div>
          <button
            className="nav-item"
            style={{ border: 0, background: "transparent" }}
            onClick={logout}
          >
            <Icon name="logout" />
            <span>Encerrar sessão</span>
          </button>
        </div>
      </aside>
      <header className="app-header">
        <div className="header-left">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir navegação"
            onClick={() => setMenu(!menu)}
          >
            <Icon name="menu" />
          </button>
          <div className="header-title">
            <Icon name="home_work" /> Painel Corretor <span>/</span>
            <strong>Gestão Ativa</strong>
          </div>
          <div className="header-time">
            <Icon name="schedule" size={13} /> Horário de Brasília (GMT-3)
          </div>
        </div>
        <div className="header-right">
          <button
            className="icon-button"
            aria-label="Notificações"
            onClick={() => setNotifications(true)}
          >
            <Icon name="notifications" />
          </button>
          <button
            className="user-button"
            aria-label="Abrir menu da conta"
            aria-expanded={profile}
            onClick={() => setProfile(!profile)}
          >
            <Avatar name={user!.name} />
            <div>
              <strong>{user?.name}</strong>
              <small>
                {user?.role === "OPERATOR" ? "Operador" : "Corretor autônomo"}
                {user?.creci ? ` · CRECI ${user.creci}` : ""}
              </small>
            </div>
            <Icon name="chevron_right" size={14} />
          </button>
          {profile && (
            <div className="user-dropdown">
              <NavLink to="/configuracoes" onClick={() => setProfile(false)}>
                <Icon name="person" />
                Minha conta
              </NavLink>
              <NavLink to="/configuracoes" onClick={() => setProfile(false)}>
                <Icon name="settings" />
                Configurações
              </NavLink>
              <button onClick={logout}>
                <Icon name="logout" />
                Sair
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        <Suspense fallback={<Loading />}>
          <Outlet />
        </Suspense>
      </main>
      {notifications && (
        <Modal title="Notificações" onClose={() => setNotifications(false)}>
          <p className="muted">
            Consulte a agenda e as tarefas para acompanhar os próximos
            compromissos da sua carteira.
          </p>
          <div className="actions">
            <NavLink to="/agenda" onClick={() => setNotifications(false)}>
              <Button>Ver agenda</Button>
            </NavLink>
            <NavLink to="/tarefas" onClick={() => setNotifications(false)}>
              <Button variant="secondary">Ver tarefas</Button>
            </NavLink>
          </div>
        </Modal>
      )}
    </>
  );
}
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/cadastro" element={<AuthPage key="cadastro" />} />
      <Route element={<Protected />}>
        <Route index element={<Navigate to="/leads" replace />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/leads/:id" element={<LeadDetailPage />} />
        <Route path="/imoveis" element={<PropertiesPage />} />
        <Route path="/imoveis/:id" element={<PropertyDossierPage />} />
        <Route path="/agenda" element={<AgendaPage />} />
        <Route path="/visitas/:id" element={<VisitPage />} />
        <Route path="/tarefas" element={<TasksPage />} />
        <Route path="/funil" element={<PipelinePage />} />
        <Route path="/negocios/:id" element={<CommercialPage />} />
        <Route path="/documentos/:id" element={<DocumentPage />} />
        <Route path="/operacoes/*" element={<OperationsPage />} />
        <Route path="/configuracoes" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/leads" replace />} />
      </Route>
    </Routes>
  );
}
