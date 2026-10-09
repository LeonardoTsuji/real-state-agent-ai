import {
  cloneElement,
  isValidElement,
  useRef,
  type ReactElement,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Sparkles,
  Users,
  Filter,
  Building2,
  CalendarDays,
  ListTodo,
  Settings,
  Activity,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  Check,
  CheckCircle2,
  X,
  AlertTriangle,
  Clock,
  MessageCircle,
  Phone,
  Mail,
  MapPin,
  SlidersHorizontal,
  Download,
  Upload,
  RefreshCw,
  LogOut,
  ShieldCheck,
  FileText,
  MoreHorizontal,
  Copy,
  Eye,
  BedDouble,
  Car,
  Ruler,
  Mic,
  Camera,
  Map,
  CheckSquare,
  Send,
  Coins,
  Home,
  PanelLeft,
  Loader2,
  LockKeyhole,
  Bell,
  User,
  LayoutGrid,
  Table2,
  Heart,
  Play,
  Printer,
  ExternalLink,
  Pencil,
  Trash2,
  CalendarCheck,
} from "lucide-react";
const icons: Record<string, typeof Sparkles> = {
  auto_awesome: Sparkles,
  sparkles: Sparkles,
  neurology: Sparkles,
  psychology: Sparkles,
  groups: Users,
  person_search: Users,
  filter_alt: Filter,
  view_kanban: LayoutGrid,
  apartment: Building2,
  home_work: Building2,
  real_estate_agent: Building2,
  calendar_today: CalendarDays,
  calendar_month: CalendarDays,
  event_available: CalendarCheck,
  task_alt: ListTodo,
  check_circle: CheckCircle2,
  settings: Settings,
  analytics: Activity,
  insights: Activity,
  tune: SlidersHorizontal,
  search: Search,
  add: Plus,
  chevron_left: ChevronLeft,
  chevron_right: ChevronRight,
  arrow_forward: ArrowRight,
  arrow_back: ArrowLeft,
  check: Check,
  close: X,
  warning: AlertTriangle,
  schedule: Clock,
  timer: Clock,
  chat: MessageCircle,
  call: Phone,
  phone: Phone,
  mail: Mail,
  location_on: MapPin,
  pin_drop: MapPin,
  download: Download,
  upload: Upload,
  file_upload: Upload,
  refresh: RefreshCw,
  sync: RefreshCw,
  logout: LogOut,
  verified: ShieldCheck,
  verified_user: ShieldCheck,
  description: FileText,
  picture_as_pdf: FileText,
  receipt_long: FileText,
  more_vert: MoreHorizontal,
  content_copy: Copy,
  visibility: Eye,
  bed: BedDouble,
  directions_car: Car,
  square_foot: Ruler,
  mic: Mic,
  photo_camera: Camera,
  map: Map,
  checklist: CheckSquare,
  send: Send,
  payments: Coins,
  home: Home,
  menu: PanelLeft,
  progress_activity: Loader2,
  lock: LockKeyhole,
  notifications: Bell,
  person: User,
  grid_view: LayoutGrid,
  table_rows: Table2,
  favorite: Heart,
  play_arrow: Play,
  print: Printer,
  open_in_new: ExternalLink,
  edit: Pencil,
  delete: Trash2,
};
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const C = icons[name] ?? Sparkles;
  return (
    <C size={size} className={className} aria-hidden="true" strokeWidth={1.8} />
  );
}
export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "copilot";
}) {
  return (
    <button
      type="button"
      className={`button button-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: string;
  className?: string;
}) {
  return (
    <span className={`badge badge-${tone.toLowerCase()} ${className}`}>
      {children}
    </span>
  );
}
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="breadcrumbs">
          Painel Corretor <Icon name="chevron_right" size={14} />
          <span>Gestão ativa</span>
        </div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
export function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {isValidElement(children) &&
      typeof children.type === "string" &&
      ["input", "select", "textarea"].includes(children.type)
        ? cloneElement(children as ReactElement<{ "aria-label"?: string }>, {
            "aria-label": label,
          })
        : children}
      {error && (
        <span role="alert" className="field-error">
          {error}
        </span>
      )}
    </label>
  );
}
export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const opener = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal-content"
          aria-label={title}
          aria-labelledby={undefined}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
        >
          <div className="modal-header">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label="Fechar diálogo">
              <Icon name="close" />
            </Dialog.Close>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Loading() {
  return (
    <div role="status" className="empty-state">
      <Icon name="progress_activity" className="spin" size={28} />
      <span>Carregando dados…</span>
    </div>
  );
}
export function Empty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="search" size={28} />
      </span>
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
    </div>
  );
}
export function ErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="error-panel">
      <Icon name="warning" />
      <div>
        <strong>Não foi possível concluir</strong>
        <p>
          {error instanceof Error
            ? error.message
            : "Tente novamente em instantes."}
        </p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
export function Avatar({ name }: { name: string }) {
  return (
    <span className="avatar">
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
export function Simulation() {
  return (
    <Badge tone="warning">
      <Icon name="auto_awesome" size={12} /> Simulação
    </Badge>
  );
}
