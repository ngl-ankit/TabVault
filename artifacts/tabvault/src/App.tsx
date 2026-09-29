import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ArchiveRestore,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Bookmark,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Command,
  Copy,
  Download,
  FileJson,
  FolderOpen,
  FolderPlus,
  Globe2,
  Grid2X2,
  History,
  Keyboard,
  Layers3,
  LayoutDashboard,
  Link2,
  LockKeyhole,
  Menu,
  Moon,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Link, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

type Theme = 'light' | 'dark' | 'system';
type RestoreBehavior = 'ask' | 'restore-all' | 'restore-pinned';
type DuplicateHandling = 'keep' | 'replace';

export type TabRecord = {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  domain: string;
  note: string;
  pinned: boolean;
  groupId?: string;
  createdAt: string;
};

export type GroupRecord = { id: string; name: string; collapsed: boolean };
export type Snapshot = { id: string; label: string; createdAt: string; tabIds: string[] };
export type Workspace = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
  tabs: TabRecord[];
  groups: GroupRecord[];
  notes: string;
  accent: string;
  snapshots: Snapshot[];
};
export type ActivityItem = {
  id: string;
  type: 'created' | 'updated' | 'restored' | 'snapshot' | 'imported' | 'deleted';
  workspaceId?: string;
  label: string;
  createdAt: string;
};
export type Settings = {
  theme: Theme;
  compactMode: boolean;
  restoreBehavior: RestoreBehavior;
  duplicateHandling: DuplicateHandling;
  autoSnapshots: boolean;
};

type PersistedState = { workspaces: Workspace[]; activity: ActivityItem[]; settings: Settings };

export type TabVaultCallbacks = {
  onCreateWorkspace?: (workspace: Workspace) => void;
  onUpdateWorkspace?: (workspace: Workspace) => void;
  onDeleteWorkspace?: (workspaceId: string) => void;
  onDuplicateWorkspace?: (workspace: Workspace) => void;
  onRestoreTab?: (tab: TabRecord, workspace: Workspace) => void;
  onRestoreSnapshot?: (snapshot: Snapshot, workspace: Workspace) => void;
  onCaptureWindow?: (workspaceId?: string) => void;
  onSettingsChange?: (settings: Settings) => void;
};

const STORAGE_KEY = 'tabvault-local-state-v1';
const accentOptions = ['#5c8d80', '#bd7d4b', '#7388ad', '#9e769d', '#899a61'];
const defaultSettings: Settings = {
  theme: 'light',
  compactMode: false,
  restoreBehavior: 'ask',
  duplicateHandling: 'keep',
  autoSnapshots: true,
};

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function now() {
  return new Date().toISOString();
}

function relativeDate(value?: string) {
  if (!value) return 'Not yet opened';
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Yesterday' : `${days}d ago`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
    new Date(value),
  );
}

function getDomain(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value.replace(/^https?:\/\//, '').split('/')[0] || 'local';
  }
}

function readState(): PersistedState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PersistedState;
      return {
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
        activity: Array.isArray(parsed.activity) ? parsed.activity : [],
        settings: { ...defaultSettings, ...(parsed.settings || {}) },
      };
    }
  } catch {
    // A corrupt local store should never prevent the utility from opening.
  }
  return { workspaces: [], activity: [], settings: defaultSettings };
}

function IconButton({
  label,
  onClick,
  children,
  tone = 'quiet',
  testId,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  tone?: 'quiet' | 'solid' | 'danger';
  testId: string;
  disabled?: boolean;
}) {
  const style =
    tone === 'solid'
      ? 'bg-primary text-primary-foreground hover:brightness-105'
      : tone === 'danger'
        ? 'text-destructive hover:bg-destructive/10'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground';
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className={`tv-focus-ring inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${style}`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  icon,
  eyebrow,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
      <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-primary">{icon}</div>
      <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p>
      <h3 className="max-w-md text-lg font-bold tracking-[-0.02em]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function Modal({
  title,
  description,
  onClose,
  children,
  testId,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[hsl(163_28%_10%/0.46)] p-4 backdrop-blur-sm" data-testid={testId}>
      <div className="tv-card tv-reveal w-full max-w-lg rounded-2xl p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold tracking-[-0.03em]">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          <IconButton label="Close dialog" testId="button-close-dialog" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

function WorkspaceFormModal({
  editing,
  onClose,
  onSave,
}: {
  editing?: Workspace;
  onClose: () => void;
  onSave: (name: string, description: string, accent: string) => void;
}) {
  const [name, setName] = useState(editing?.name || '');
  const [description, setDescription] = useState(editing?.description || '');
  const [accent, setAccent] = useState(editing?.accent || accentOptions[0]);
  const canSave = name.trim().length > 1;
  return (
    <Modal
      title={editing ? 'Edit workspace' : 'New workspace'}
      description="A workspace is a quiet home for one kind of work."
      onClose={onClose}
      testId="dialog-workspace-form"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (canSave) onSave(name.trim(), description.trim(), accent);
        }}
        className="space-y-5"
      >
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Name</span>
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Research, writing, client work…"
            data-testid="input-workspace-name"
            className="tv-focus-ring h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Description <span className="font-normal normal-case tracking-normal">(optional)</span></span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What belongs here?"
            rows={3}
            data-testid="input-workspace-description"
            className="tv-focus-ring w-full resize-none rounded-xl border border-input bg-background px-3 py-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-primary"
          />
        </label>
        <div>
          <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Accent</span>
          <div className="flex gap-2">
            {accentOptions.map((option) => (
              <button
                type="button"
                key={option}
                onClick={() => setAccent(option)}
                aria-label={`Use ${option} accent`}
                data-testid={`button-accent-${option.replace('#', '')}`}
                className={`h-8 w-8 rounded-full border-2 transition ${accent === option ? 'scale-110 border-foreground' : 'border-transparent'}`}
                style={{ backgroundColor: option }}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border pt-5">
          <IconButton label="Cancel" testId="button-cancel-workspace" onClick={onClose}>Cancel</IconButton>
          <button
            type="submit"
            disabled={!canSave}
            data-testid="button-save-workspace"
            className="tv-focus-ring inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Check className="h-4 w-4" /> {editing ? 'Save changes' : 'Create workspace'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Sidebar({ onNewWorkspace, workspaces }: { onNewWorkspace: () => void; workspaces: Workspace[] }) {
  const [location] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const isActive = (href: string) => (href === '/' ? location === '/' : location.startsWith(href));
  return (
    <aside className={`tv-sidebar flex shrink-0 flex-col transition-all duration-300 ${collapsed ? 'w-[76px]' : 'w-[244px]'}`}>
      <div className="tv-brand flex items-center gap-3 px-5 py-6">
        <div className="tv-brand-mark"><Layers3 className="h-[18px] w-[18px]" strokeWidth={2.5} /></div>
        {!collapsed ? <div className="tv-side-copy"><div className="text-[15px] font-black tracking-[-0.04em]">TabVault</div><div className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-sidebar-foreground/55">private command center</div></div> : null}
      </div>
      <nav className="space-y-1 px-3">
        <p className="tv-side-section mb-2 px-3 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/40">Navigate</p>
        <Link href="/" data-testid="link-dashboard" className={`tv-nav-link tv-focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive('/') ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/66 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}>
          <LayoutDashboard className="h-[17px] w-[17px] shrink-0" /><span className="tv-nav-label">Dashboard</span>
        </Link>
        <Link href="/settings" data-testid="link-settings" className={`tv-nav-link tv-focus-ring flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive('/settings') ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/66 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}>
          <Settings2 className="h-[17px] w-[17px] shrink-0" /><span className="tv-nav-label">Settings</span>
        </Link>
      </nav>
      <div className="tv-side-section mt-8 px-5 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-sidebar-foreground/40">Workspaces</div>
      <div className="tv-scroll mt-2 flex-1 overflow-y-auto px-3">
        {workspaces.length === 0 ? (
          <div className="tv-side-copy px-3 py-3 text-xs leading-5 text-sidebar-foreground/45">Your spaces will live here once you create one.</div>
        ) : (
          workspaces.map((workspace) => (
            <Link href={`/workspace/${workspace.id}`} key={workspace.id} data-testid={`link-workspace-${workspace.id}`} className={`tv-nav-link tv-focus-ring mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${isActive(`/workspace/${workspace.id}`) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground'}`}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: workspace.accent }} />
              <span className="tv-nav-label min-w-0 truncate">{workspace.name}</span>
              <span className="tv-nav-label ml-auto font-mono text-[10px] text-sidebar-foreground/35">{workspace.tabs.length}</span>
            </Link>
          ))
        )}
      </div>
      <div className="tv-side-footer space-y-2 px-3 pb-4">
        <button type="button" onClick={onNewWorkspace} data-testid="button-sidebar-new-workspace" className="tv-nav-link tv-focus-ring flex w-full items-center gap-3 rounded-xl border border-sidebar-border px-3 py-2.5 text-left text-sm font-bold text-sidebar-foreground transition hover:bg-sidebar-accent">
          <Plus className="h-[17px] w-[17px] shrink-0" /><span className="tv-nav-label">New workspace</span>
        </button>
        <button type="button" onClick={() => setCollapsed(!collapsed)} data-testid="button-collapse-sidebar" className="tv-nav-link tv-focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-sidebar-foreground">
          <Menu className="h-4 w-4 shrink-0" /><span className="tv-nav-label">{collapsed ? 'Expand rail' : 'Collapse rail'}</span>
        </button>
      </div>
    </aside>
  );
}

function Topbar({ onCommand }: { onCommand: () => void }) {
  const [location] = useLocation();
  const title = location === '/' ? 'Workspace dashboard' : location === '/settings' ? 'Preferences' : location === '/popup' ? 'TabVault popup' : 'Workspace';
  return (
    <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border/70 px-5 py-4 md:px-8">
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">TabVault / {title}</p>
        <p className="mt-1 truncate text-sm text-muted-foreground">Local by design. Yours by default.</p>
      </div>
      <button type="button" onClick={onCommand} data-testid="button-open-command-palette" className="tv-focus-ring hidden h-10 items-center gap-3 rounded-xl border border-input bg-card px-3 text-sm text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground sm:flex">
        <Command className="h-4 w-4" /><span>Jump anywhere</span><kbd className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
      </button>
    </header>
  );
}

function ActivityFeed({ activity, workspaceId }: { activity: ActivityItem[]; workspaceId?: string }) {
  const items = activity.filter((item) => !workspaceId || item.workspaceId === workspaceId).slice(0, 6);
  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">Your workspace history will appear here.</div>
      ) : (
        items.map((item) => (
          <div key={item.id} data-testid={`activity-${item.id}`} className="flex items-start gap-3">
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
              {item.type === 'snapshot' ? <ArchiveRestore className="h-3.5 w-3.5" /> : item.type === 'restored' ? <RefreshCw className="h-3.5 w-3.5" /> : item.type === 'deleted' ? <Trash2 className="h-3.5 w-3.5" /> : <History className="h-3.5 w-3.5" />}
            </div>
            <div className="min-w-0 flex-1"><p className="text-sm leading-5">{item.label}</p><p className="font-mono text-[10px] text-muted-foreground">{relativeDate(item.createdAt)}</p></div>
          </div>
        ))
      )}
    </div>
  );
}

function DashboardPage({
  workspaces,
  activity,
  onNewWorkspace,
  onEditWorkspace,
  onDuplicateWorkspace,
  onDeleteWorkspace,
  onCommand,
}: {
  workspaces: Workspace[];
  activity: ActivityItem[];
  onNewWorkspace: () => void;
  onEditWorkspace: (workspace: Workspace) => void;
  onDuplicateWorkspace: (workspace: Workspace) => void;
  onDeleteWorkspace: (workspace: Workspace) => void;
  onCommand: () => void;
}) {
  const [query, setQuery] = useState('');
  const visible = workspaces.filter((workspace) => `${workspace.name} ${workspace.description}`.toLowerCase().includes(query.toLowerCase()));
  const totalTabs = workspaces.reduce((sum, workspace) => sum + workspace.tabs.length, 0);
  return (
    <div className="mx-auto max-w-[1320px] space-y-8 px-5 py-8 md:px-8 md:py-10">
      <section className="tv-reveal grid gap-8 lg:grid-cols-[1fr_0.7fr] lg:items-end">
        <div>
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Nothing leaves this device</div>
          <h1 className="max-w-2xl text-4xl font-black leading-[1.04] tracking-[-0.055em] md:text-6xl">Make room for the work<br /><span className="text-primary">behind the tabs.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">TabVault turns browser overflow into named, searchable workspaces — without accounts, syncing, or a server in the middle.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <button type="button" onClick={onNewWorkspace} data-testid="button-new-workspace" className="tv-focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-105"><Plus className="h-4 w-4" /> New workspace</button>
            <button type="button" onClick={onCommand} data-testid="button-dashboard-command" className="tv-focus-ring inline-flex h-11 items-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-bold transition hover:border-primary/40"><Command className="h-4 w-4 text-muted-foreground" /> Command palette <kbd className="ml-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd></button>
          </div>
        </div>
        <div className="tv-grid tv-card rounded-2xl p-5">
          <div className="mb-5 flex items-center justify-between"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">At a glance</p><Grid2X2 className="h-4 w-4 text-primary" /></div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border">
            <Metric label="Workspaces" value={workspaces.length} />
            <Metric label="Saved tabs" value={totalTabs} />
            <Metric label="Snapshots" value={workspaces.reduce((sum, item) => sum + item.snapshots.length, 0)} />
            <Metric label="Last active" value={workspaces.length ? relativeDate(workspaces[0].lastOpenedAt) : '—'} />
          </div>
        </div>
      </section>
      <section className="tv-reveal tv-reveal-delay-1">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Your spaces</p><h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">Workspaces</h2></div>
          <label className="relative block w-full sm:w-64"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter workspaces" data-testid="input-search-workspaces" className="tv-focus-ring h-10 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary" /></label>
        </div>
        {workspaces.length === 0 ? (
          <EmptyState icon={<FolderOpen className="h-6 w-6" />} eyebrow="A clear desk" title="No workspaces yet" description="Create your first space for a project, a research thread, or the thing you keep reopening every morning." action={<button type="button" onClick={onNewWorkspace} data-testid="button-empty-new-workspace" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition hover:brightness-105"><FolderPlus className="h-4 w-4" /> Create a workspace</button>} />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Search className="h-6 w-6" />} eyebrow="No match" title="Nothing in that corner" description="Try a different workspace name or description." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map((workspace, index) => <WorkspaceCard key={workspace.id} workspace={workspace} index={index} onEdit={() => onEditWorkspace(workspace)} onDuplicate={() => onDuplicateWorkspace(workspace)} onDelete={() => onDeleteWorkspace(workspace)} />)}
          </div>
        )}
      </section>
      <section className="tv-reveal tv-reveal-delay-2 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="tv-card rounded-2xl p-5">
          <div className="mb-5 flex items-start justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Local journal</p><h2 className="mt-1 text-lg font-black tracking-[-0.03em]">Recent activity</h2></div><History className="h-5 w-5 text-primary" /></div>
          <ActivityFeed activity={activity} />
        </div>
        <div className="rounded-2xl bg-primary p-6 text-primary-foreground">
          <Sparkles className="mb-8 h-5 w-5 text-accent" />
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground/60">A smaller promise</p>
          <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.04em]">Your browser can be busy without feeling loud.</h2>
          <p className="mt-3 text-sm leading-6 text-primary-foreground/70">Every workspace is stored locally. No login means no new place for your browsing history to travel.</p>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="bg-card p-4"><p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black tracking-[-0.04em]">{value}</p></div>;
}

function WorkspaceCard({ workspace, index, onEdit, onDuplicate, onDelete }: { workspace: Workspace; index: number; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  return (
    <article className="tv-card tv-reveal rounded-2xl p-5 transition hover:-translate-y-0.5 hover:shadow-lg" style={{ animationDelay: `${index * 60}ms` }} data-testid={`card-workspace-${workspace.id}`}>
      <div className="mb-7 flex items-start justify-between gap-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: workspace.accent }} /><div className="flex gap-1"><IconButton label="Edit workspace" testId={`button-edit-workspace-${workspace.id}`} onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></IconButton><IconButton label="Duplicate workspace" testId={`button-duplicate-workspace-${workspace.id}`} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></IconButton><IconButton label="Delete workspace" tone="danger" testId={`button-delete-workspace-${workspace.id}`} onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconButton></div></div>
      <Link href={`/workspace/${workspace.id}`} data-testid={`link-open-workspace-${workspace.id}`} className="tv-focus-ring block rounded-lg outline-none">
        <h3 className="truncate text-xl font-black tracking-[-0.04em]">{workspace.name}</h3>
        <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">{workspace.description || 'A focused place for saved browser context.'}</p>
      </Link>
      <div className="mt-6 flex items-center justify-between border-t border-border pt-4"><span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{workspace.tabs.length} tabs · {workspace.snapshots.length} snapshots</span><span className="text-xs text-muted-foreground">{relativeDate(workspace.lastOpenedAt)}</span></div>
    </article>
  );
}

function WorkspaceDetailPage({
  workspaces,
  activity,
  onBack,
  onEdit,
  onDuplicate,
  onDelete,
  onAddTab,
  onUpdateTab,
  onDeleteTab,
  onCreateGroup,
  onToggleGroup,
  onCreateSnapshot,
  onRestoreSnapshot,
  onRestoreTab,
  onUpdateNotes,
}: {
  workspaces: Workspace[];
  activity: ActivityItem[];
  onBack: () => void;
  onEdit: (workspace: Workspace) => void;
  onDuplicate: (workspace: Workspace) => void;
  onDelete: (workspace: Workspace) => void;
  onAddTab: (workspace: Workspace, values: { url: string; title: string; note: string; pinned: boolean; groupId?: string }) => void;
  onUpdateTab: (workspace: Workspace, tab: TabRecord, patch: Partial<TabRecord>) => void;
  onDeleteTab: (workspace: Workspace, tab: TabRecord) => void;
  onCreateGroup: (workspace: Workspace, name: string) => void;
  onToggleGroup: (workspace: Workspace, groupId: string) => void;
  onCreateSnapshot: (workspace: Workspace) => void;
  onRestoreSnapshot: (workspace: Workspace, snapshot: Snapshot) => void;
  onRestoreTab: (workspace: Workspace, tab: TabRecord) => void;
  onUpdateNotes: (workspace: Workspace, notes: string) => void;
}) {
  const params = useParams<{ id: string }>();
  const workspace = workspaces.find((item) => item.id === params.id);
  const [query, setQuery] = useState('');
  const [showPinned, setShowPinned] = useState(false);
  const [showAddTab, setShowAddTab] = useState(false);
  const [showGroupComposer, setShowGroupComposer] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  if (!workspace) {
    return <div className="mx-auto max-w-3xl px-5 py-20"><EmptyState icon={<CircleAlert className="h-6 w-6" />} eyebrow="Workspace unavailable" title="This space could not be found" description="It may have been removed from local storage." action={<button type="button" onClick={onBack} data-testid="button-return-dashboard" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><ArrowLeft className="h-4 w-4" /> Back to dashboard</button>} /></div>;
  }
  const filteredTabs = workspace.tabs.filter((tab) => {
    const matches = `${tab.title} ${tab.url} ${tab.domain} ${tab.note}`.toLowerCase().includes(query.toLowerCase());
    return matches && (!showPinned || tab.pinned);
  });
  const tabsByGroup = new Map<string | undefined, TabRecord[]>();
  filteredTabs.forEach((tab) => tabsByGroup.set(tab.groupId, [...(tabsByGroup.get(tab.groupId) || []), tab]));
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-5 py-7 md:px-8 md:py-9">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <button type="button" onClick={onBack} data-testid="button-back-dashboard" className="tv-focus-ring mb-4 inline-flex items-center gap-2 text-xs font-bold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> All workspaces</button>
          <div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: workspace.accent }} /><h1 className="text-3xl font-black tracking-[-0.05em] md:text-4xl">{workspace.name}</h1></div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{workspace.description || 'A focused place for saved browser context.'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <IconButton label="Edit workspace" testId="button-detail-edit-workspace" onClick={() => onEdit(workspace)}><Pencil className="h-4 w-4" /> <span className="hidden sm:inline">Edit</span></IconButton>
          <IconButton label="Duplicate workspace" testId="button-detail-duplicate-workspace" onClick={() => onDuplicate(workspace)}><Copy className="h-4 w-4" /> <span className="hidden sm:inline">Duplicate</span></IconButton>
          <IconButton label="Delete workspace" tone="danger" testId="button-detail-delete-workspace" onClick={() => onDelete(workspace)}><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3"><Metric label="Saved tabs" value={workspace.tabs.length} /><Metric label="Groups" value={workspace.groups.length} /><Metric label="Last opened" value={relativeDate(workspace.lastOpenedAt)} /></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <main className="min-w-0">
          <div className="tv-card overflow-hidden rounded-2xl">
            <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
              <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved tabs, URLs, and notes" data-testid="input-search-tabs" className="tv-focus-ring h-10 w-full rounded-xl border border-input bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary" /></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setShowPinned(!showPinned)} data-testid="button-filter-pinned" className={`tv-focus-ring inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition ${showPinned ? 'border-primary/40 bg-primary/10 text-primary' : 'border-input bg-card text-muted-foreground hover:text-foreground'}`}><Pin className="h-3.5 w-3.5" /> Pinned</button>
                <button type="button" onClick={() => setShowGroupComposer(!showGroupComposer)} data-testid="button-new-group" className="tv-focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-bold transition hover:border-primary/40"><FolderPlus className="h-3.5 w-3.5 text-primary" /> Group</button>
                <button type="button" onClick={() => setShowAddTab(true)} data-testid="button-add-tab" className="tv-focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-primary-foreground transition hover:brightness-105"><Plus className="h-3.5 w-3.5" /> Add tab</button>
              </div>
            </div>
            {showGroupComposer ? <div className="flex gap-2 border-b border-border bg-muted/40 p-3"><input autoFocus value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Group name" data-testid="input-group-name" className="tv-focus-ring h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none" /><button type="button" onClick={() => { if (groupName.trim()) { onCreateGroup(workspace, groupName.trim()); setGroupName(''); setShowGroupComposer(false); } }} data-testid="button-save-group" className="rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground">Create group</button></div> : null}
            {workspace.tabs.length === 0 ? <div className="p-4"><EmptyState icon={<Link2 className="h-6 w-6" />} eyebrow="No saved tabs" title="This workspace is ready for its first tab" description="Capture a browser window from the extension, or add a tab manually while you shape this space." action={<button type="button" onClick={() => setShowAddTab(true)} data-testid="button-empty-add-tab" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> Add a tab</button>} /></div> : filteredTabs.length === 0 ? <div className="p-4"><EmptyState icon={<Search className="h-6 w-6" />} eyebrow="Nothing found" title="No tabs match this view" description={showPinned ? 'No pinned tabs yet. Pin a tab to keep it close.' : 'Try a different search term.'} /></div> : <div className="divide-y divide-border">{workspace.groups.map((group) => { const groupTabs = tabsByGroup.get(group.id) || []; if (groupTabs.length === 0 && query) return null; return <div key={group.id}><button type="button" onClick={() => onToggleGroup(workspace, group.id)} data-testid={`button-toggle-group-${group.id}`} className="flex w-full items-center gap-2 bg-muted/35 px-4 py-2 text-left text-xs font-bold text-muted-foreground"><ChevronDown className={`h-3.5 w-3.5 transition ${group.collapsed ? '-rotate-90' : ''}`} /><span>{group.name}</span><span className="font-mono text-[10px]">{groupTabs.length}</span></button>{!group.collapsed && groupTabs.map((tab) => <TabRow key={tab.id} tab={tab} workspace={workspace} active={activeTabId === tab.id} onActivate={() => setActiveTabId(activeTabId === tab.id ? null : tab.id)} onRestore={() => onRestoreTab(workspace, tab)} onUpdate={(patch) => onUpdateTab(workspace, tab, patch)} onDelete={() => onDeleteTab(workspace, tab)} />)}</div>; })}{(tabsByGroup.get(undefined) || []).map((tab) => <TabRow key={tab.id} tab={tab} workspace={workspace} active={activeTabId === tab.id} onActivate={() => setActiveTabId(activeTabId === tab.id ? null : tab.id)} onRestore={() => onRestoreTab(workspace, tab)} onUpdate={(patch) => onUpdateTab(workspace, tab, patch)} onDelete={() => onDeleteTab(workspace, tab)} />)}</div>}
          </div>
        </main>
        <aside className="space-y-4">
          <div className="tv-card rounded-2xl p-5"><div className="mb-3 flex items-center justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Workspace note</p><h2 className="mt-1 text-base font-black">Keep the thread</h2></div><Bookmark className="h-4 w-4 text-primary" /></div><textarea value={workspace.notes} onChange={(event) => onUpdateNotes(workspace, event.target.value)} placeholder="What is this workspace for? Add a little context for future-you." data-testid="textarea-workspace-notes" rows={6} className="tv-focus-ring w-full resize-none rounded-xl border border-input bg-background p-3 text-sm leading-6 outline-none transition focus:border-primary" /><p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">Saved locally</p></div>
          <div className="tv-card rounded-2xl p-5"><div className="mb-4 flex items-start justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Snapshots</p><h2 className="mt-1 text-base font-black">Restore points</h2></div><button type="button" onClick={() => onCreateSnapshot(workspace)} data-testid="button-create-snapshot" className="tv-focus-ring rounded-lg p-1.5 text-primary transition hover:bg-primary/10" title="Create snapshot"><ArchiveRestore className="h-4 w-4" /></button></div>{workspace.snapshots.length === 0 ? <p className="text-sm leading-5 text-muted-foreground">Save a point-in-time copy before you rearrange this space.</p> : <div className="space-y-2">{workspace.snapshots.map((snapshot) => <div key={snapshot.id} className="flex items-center gap-2 rounded-xl bg-muted/50 p-2.5"><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{snapshot.label}</p><p className="font-mono text-[10px] text-muted-foreground">{formatDate(snapshot.createdAt)} · {snapshot.tabIds.length} tabs</p></div><button type="button" onClick={() => onRestoreSnapshot(workspace, snapshot)} data-testid={`button-restore-snapshot-${snapshot.id}`} className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-background hover:text-primary" title="Restore snapshot"><RefreshCw className="h-3.5 w-3.5" /></button></div>)}</div>}</div>
          <div className="tv-card rounded-2xl p-5"><div className="mb-4 flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h2 className="text-base font-black">Activity</h2></div><ActivityFeed activity={activity} workspaceId={workspace.id} /></div>
        </aside>
      </div>
      {showAddTab ? <AddTabModal workspace={workspace} onClose={() => setShowAddTab(false)} onSave={(values) => { onAddTab(workspace, values); setShowAddTab(false); }} /> : null}
    </div>
  );
}

function AddTabModal({ workspace, onClose, onSave }: { workspace: Workspace; onClose: () => void; onSave: (values: { url: string; title: string; note: string; pinned: boolean; groupId?: string }) => void }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [pinned, setPinned] = useState(false);
  const [groupId, setGroupId] = useState('');
  return <Modal title="Add a saved tab" description="Add a URL and a little context. Browser metadata can be enriched when the extension connects." onClose={onClose} testId="dialog-add-tab"><form onSubmit={(event) => { event.preventDefault(); if (url.trim()) onSave({ url: url.trim(), title: title.trim() || getDomain(url), note: note.trim(), pinned, groupId: groupId || undefined }); }} className="space-y-4"><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">URL</span><input autoFocus type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/article" data-testid="input-tab-url" className="tv-focus-ring h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /></label><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Title</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="A useful name for this tab" data-testid="input-tab-title" className="tv-focus-ring h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /></label><label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Why is this here?" data-testid="input-tab-note" className="tv-focus-ring h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary" /></label>{workspace.groups.length > 0 ? <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Group</span><select value={groupId} onChange={(event) => setGroupId(event.target.value)} data-testid="select-tab-group" className="tv-focus-ring h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="">Ungrouped</option>{workspace.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label> : null}<button type="button" onClick={() => setPinned(!pinned)} data-testid="button-toggle-new-tab-pinned" className={`flex items-center gap-2 text-sm font-bold ${pinned ? 'text-primary' : 'text-muted-foreground'}`}><Pin className="h-4 w-4" /> Keep this tab pinned</button><div className="flex justify-end gap-2 border-t border-border pt-5"><IconButton label="Cancel" testId="button-cancel-add-tab" onClick={onClose}>Cancel</IconButton><button type="submit" data-testid="button-save-tab" className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"><Plus className="h-4 w-4" /> Save tab</button></div></form></Modal>;
}

function TabRow({ tab, workspace, active, onActivate, onRestore, onUpdate, onDelete }: { tab: TabRecord; workspace: Workspace; active: boolean; onActivate: () => void; onRestore: () => void; onUpdate: (patch: Partial<TabRecord>) => void; onDelete: () => void }) {
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(tab.note);
  return <div className={`group flex items-start gap-3 px-4 py-3 transition hover:bg-muted/35 ${active ? 'bg-muted/45' : ''}`} data-testid={`row-tab-${tab.id}`}><div className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Globe2 className="h-3.5 w-3.5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={onRestore} data-testid={`button-open-tab-${tab.id}`} className="tv-focus-ring max-w-full truncate text-left text-sm font-bold hover:text-primary">{tab.title}</button>{tab.pinned ? <Pin className="h-3 w-3 text-accent" /> : null}</div><p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{tab.domain} · {tab.url}</p>{tab.note && !editingNote ? <button type="button" onClick={() => setEditingNote(true)} data-testid={`button-edit-note-${tab.id}`} className="mt-2 block max-w-full truncate text-left text-xs italic text-muted-foreground hover:text-foreground">“{tab.note}”</button> : null}{editingNote ? <div className="mt-2 flex gap-2"><input autoFocus value={note} onChange={(event) => setNote(event.target.value)} data-testid={`input-note-${tab.id}`} className="tv-focus-ring h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-xs outline-none" /><button type="button" onClick={() => { onUpdate({ note }); setEditingNote(false); }} data-testid={`button-save-note-${tab.id}`} className="rounded-lg bg-primary px-2 text-xs font-bold text-primary-foreground">Save</button></div> : null}</div><div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100"><button type="button" onClick={() => onUpdate({ pinned: !tab.pinned })} aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'} data-testid={`button-pin-tab-${tab.id}`} className={`rounded-lg p-2 transition hover:bg-secondary ${tab.pinned ? 'text-accent' : 'text-muted-foreground'}`}><Pin className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setEditingNote(!editingNote)} aria-label="Edit tab note" data-testid={`button-note-tab-${tab.id}`} className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={onRestore} aria-label="Restore tab" data-testid={`button-restore-tab-${tab.id}`} className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary hover:text-primary"><ArrowUpFromLine className="h-3.5 w-3.5" /></button><button type="button" onClick={onDelete} aria-label="Delete tab" data-testid={`button-delete-tab-${tab.id}`} className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button><button type="button" onClick={onActivate} aria-label="Show tab actions" data-testid={`button-more-tab-${tab.id}`} className="rounded-lg p-2 text-muted-foreground transition hover:bg-secondary"><MoreHorizontal className="h-3.5 w-3.5" /></button></div>{active ? <div className="absolute" /> : null}</div>;
}

function SettingsPage({ settings, onSettingsChange, onExport, onImport, onReset }: { settings: Settings; onSettingsChange: (patch: Partial<Settings>) => void; onExport: () => void; onImport: (file: File) => void; onReset: () => void }) {
  const fileRef = useMemo(() => ({ current: null as HTMLInputElement | null }), []);
  const update = (patch: Partial<Settings>) => onSettingsChange(patch);
  return <div className="mx-auto max-w-[1050px] space-y-8 px-5 py-8 md:px-8 md:py-10"><div className="tv-reveal"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">The quiet controls</p><h1 className="mt-2 text-4xl font-black tracking-[-0.055em]">Preferences</h1><p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Tune how TabVault feels and how it behaves when your browser comes back to life.</p></div><div className="grid gap-5 lg:grid-cols-[1fr_0.9fr]"><section className="tv-card tv-reveal tv-reveal-delay-1 rounded-2xl p-5 md:p-6"><SettingHeading icon={<Palette className="h-4 w-4" />} eyebrow="Appearance" title="Set the room" description="The interface follows your preference, not your system’s mood." /><div className="mt-6 grid grid-cols-3 gap-2">{(['light', 'dark', 'system'] as Theme[]).map((theme) => <button type="button" key={theme} onClick={() => update({ theme })} data-testid={`button-theme-${theme}`} className={`tv-focus-ring rounded-xl border p-3 text-left transition ${settings.theme === theme ? 'border-primary bg-primary/10 text-primary' : 'border-input hover:border-primary/30'}`}>{theme === 'light' ? <Sun className="mb-5 h-4 w-4" /> : theme === 'dark' ? <Moon className="mb-5 h-4 w-4" /> : <SlidersHorizontal className="mb-5 h-4 w-4" />}<span className="block text-xs font-bold capitalize">{theme}</span></button>)}</div><div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5"><div><p className="text-sm font-bold">Compact mode</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Tighter tab rows for a denser command center.</p></div><button type="button" role="switch" aria-checked={settings.compactMode} onClick={() => update({ compactMode: !settings.compactMode })} data-testid="switch-compact-mode" className={`relative h-6 w-11 rounded-full transition ${settings.compactMode ? 'bg-primary' : 'bg-muted'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${settings.compactMode ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></section><section className="tv-card tv-reveal tv-reveal-delay-2 rounded-2xl p-5 md:p-6"><SettingHeading icon={<ArchiveRestore className="h-4 w-4" />} eyebrow="Restore" title="Return with intent" description="Choose what happens when you restore a saved workspace." /><div className="mt-6 space-y-2">{([['ask', 'Ask every time', 'Review tabs before opening them.'], ['restore-all', 'Restore everything', 'Open every saved tab in one pass.'], ['restore-pinned', 'Pinned first', 'Bring back only the tabs you marked important.']] as [RestoreBehavior, string, string][]).map(([value, label, copy]) => <button type="button" key={value} onClick={() => update({ restoreBehavior: value })} data-testid={`button-restore-behavior-${value}`} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${settings.restoreBehavior === value ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/50 hover:border-border'}`}><span className={`grid h-5 w-5 place-items-center rounded-full border ${settings.restoreBehavior === value ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>{settings.restoreBehavior === value ? <Check className="h-3 w-3" /> : null}</span><span><span className="block text-sm font-bold">{label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{copy}</span></span></button>)}</div></section></div><section className="tv-card tv-reveal tv-reveal-delay-2 rounded-2xl p-5 md:p-6"><SettingHeading icon={<ShieldCheck className="h-4 w-4" />} eyebrow="Privacy & data" title="Your local boundary" description="TabVault has no account layer. These controls keep your local archive understandable and portable." /><div className="mt-6 grid gap-5 md:grid-cols-2"><div className="rounded-xl bg-muted/55 p-4"><div className="flex items-center gap-2 text-sm font-bold"><LockKeyhole className="h-4 w-4 text-primary" /> Local-only storage</div><p className="mt-2 text-xs leading-5 text-muted-foreground">Your workspaces live in this browser’s local storage. There is no sync service to configure.</p></div><label className="block rounded-xl bg-muted/55 p-4"><span className="text-sm font-bold">Duplicate tab handling</span><select value={settings.duplicateHandling} onChange={(event) => update({ duplicateHandling: event.target.value as DuplicateHandling })} data-testid="select-duplicate-handling" className="tv-focus-ring mt-3 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"><option value="keep">Keep both records</option><option value="replace">Replace existing URL</option></select></label></div><div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5"><div><p className="text-sm font-bold">Automatic snapshots</p><p className="mt-1 text-xs text-muted-foreground">Create a restore point before a bulk restore or capture.</p></div><button type="button" role="switch" aria-checked={settings.autoSnapshots} onClick={() => update({ autoSnapshots: !settings.autoSnapshots })} data-testid="switch-auto-snapshots" className={`relative h-6 w-11 rounded-full transition ${settings.autoSnapshots ? 'bg-primary' : 'bg-muted'}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-card transition-transform ${settings.autoSnapshots ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></section><section className="tv-card tv-reveal tv-reveal-delay-3 rounded-2xl p-5 md:p-6"><SettingHeading icon={<FileJson className="h-4 w-4" />} eyebrow="Portability" title="Move your archive" description="Export a readable JSON file or bring one back. Nothing is uploaded." /><div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={onExport} data-testid="button-export-data" className="inline-flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-bold transition hover:border-primary/40"><Download className="h-4 w-4 text-primary" /> Export data</button><button type="button" onClick={() => fileRef.current?.click()} data-testid="button-import-data" className="inline-flex h-10 items-center gap-2 rounded-xl border border-input bg-card px-4 text-sm font-bold transition hover:border-primary/40"><Upload className="h-4 w-4 text-primary" /> Import JSON</button><input ref={(element) => { fileRef.current = element; }} type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ''; }} data-testid="input-import-data" className="hidden" /><button type="button" onClick={onReset} data-testid="button-reset-data" className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-bold text-destructive transition hover:bg-destructive/10"><Trash2 className="h-4 w-4" /> Clear local data</button></div></section><section className="tv-card tv-reveal tv-reveal-delay-3 rounded-2xl p-5 md:p-6"><SettingHeading icon={<Keyboard className="h-4 w-4" />} eyebrow="Shortcuts" title="A faster route in" description="These commands stay close at hand while you work." /><div className="mt-5 grid gap-2 sm:grid-cols-2">{[['⌘K', 'Open command palette'], ['⌘⇧N', 'Create workspace'], ['⌘⇧P', 'Show pinned tabs'], ['Esc', 'Close overlays']].map(([key, label]) => <div key={key} className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5"><span className="text-sm text-muted-foreground">{label}</span><kbd className="rounded-lg border border-border bg-card px-2 py-1 font-mono text-[10px] font-bold">{key}</kbd></div>)}</div></section></div>;
}

function SettingHeading({ icon, eyebrow, title, description }: { icon: ReactNode; eyebrow: string; title: string; description: string }) {
  return <div className="flex gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-primary">{icon}</div><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</p><h2 className="mt-1 text-lg font-black tracking-[-0.03em]">{title}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p></div></div>;
}

function PopupPage({ workspaces, onCapture, onNewWorkspace }: { workspaces: Workspace[]; onCapture: () => void; onNewWorkspace: () => void }) {
  return <div className="min-h-[100dvh] bg-background p-3"><div className="mx-auto w-full max-w-[370px]"><div className="flex items-center justify-between px-2 py-2"><div className="flex items-center gap-2"><div className="tv-brand-mark h-8 w-8"><Layers3 className="h-4 w-4" /></div><div><p className="text-sm font-black tracking-[-0.04em]">TabVault</p><p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">quick capture</p></div></div><Link href="/settings" data-testid="link-popup-settings" className="tv-focus-ring rounded-lg p-2 text-muted-foreground hover:bg-muted"><Settings2 className="h-4 w-4" /></Link></div><div className="tv-card mt-3 rounded-2xl p-4"><div className="flex items-center gap-2 text-xs font-bold text-primary"><ShieldCheck className="h-4 w-4" /> Private by default</div><h1 className="mt-4 text-2xl font-black leading-tight tracking-[-0.05em]">Where should<br />this window live?</h1><p className="mt-2 text-sm leading-5 text-muted-foreground">Capture the current browser window into a workspace from the extension.</p><button type="button" onClick={onCapture} data-testid="button-popup-capture-window" className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition hover:brightness-105"><ArrowDownToLine className="h-4 w-4" /> Capture current window</button></div><div className="mt-5 flex items-center justify-between px-1"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Workspaces</p><button type="button" onClick={onNewWorkspace} data-testid="button-popup-new-workspace" className="rounded-lg p-1.5 text-primary hover:bg-primary/10" title="New workspace"><Plus className="h-4 w-4" /></button></div><div className="mt-2 space-y-2">{workspaces.length === 0 ? <div className="rounded-xl border border-dashed border-border px-4 py-7 text-center"><FolderOpen className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs font-bold">No workspaces yet</p><button type="button" onClick={onNewWorkspace} data-testid="button-popup-empty-new-workspace" className="mt-3 text-xs font-bold text-primary">Create your first one</button></div> : workspaces.map((workspace) => <Link href={`/workspace/${workspace.id}`} key={workspace.id} data-testid={`link-popup-workspace-${workspace.id}`} className="tv-focus-ring tv-card flex items-center gap-3 rounded-xl p-3 outline-none transition hover:border-primary/40"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workspace.accent }} /><span className="min-w-0 flex-1 truncate text-sm font-bold">{workspace.name}</span><span className="font-mono text-[10px] text-muted-foreground">{workspace.tabs.length}</span><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div><p className="mt-5 px-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">No account · No cloud · No noise</p></div></div>;
}

function CommandPalette({ workspaces, onClose, onNewWorkspace }: { workspaces: Workspace[]; onClose: () => void; onNewWorkspace: () => void }) {
  const [query, setQuery] = useState('');
  const [, setLocation] = useLocation();
  const actions = [{ label: 'Create new workspace', icon: <Plus className="h-4 w-4" />, action: () => { onClose(); onNewWorkspace(); } }, { label: 'Open settings', icon: <Settings2 className="h-4 w-4" />, action: () => { onClose(); setLocation('/settings'); } }];
  const matching = workspaces.filter((workspace) => workspace.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="fixed inset-0 z-50 bg-[hsl(163_28%_10%/0.42)] p-4 pt-[14vh] backdrop-blur-sm" onMouseDown={onClose} data-testid="command-palette-overlay"><div className="tv-card tv-reveal mx-auto w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b border-border px-4"><Search className="h-4 w-4 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands and workspaces" data-testid="input-command-search" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /><kbd className="rounded-md bg-muted px-1.5 py-1 font-mono text-[10px] text-muted-foreground">ESC</kbd></div><div className="max-h-[55vh] overflow-y-auto p-2">{actions.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())).map((item) => <button type="button" key={item.label} onClick={item.action} data-testid={`command-${item.label.toLowerCase().replaceAll(' ', '-')}`} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition hover:bg-muted"><span className="text-primary">{item.icon}</span>{item.label}<ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /></button>)}{matching.map((workspace) => <button type="button" key={workspace.id} onClick={() => { onClose(); setLocation(`/workspace/${workspace.id}`); }} data-testid={`command-workspace-${workspace.id}`} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold transition hover:bg-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: workspace.accent }} />Open {workspace.name}<span className="ml-auto font-mono text-[10px] text-muted-foreground">{workspace.tabs.length} tabs</span></button>)}{actions.every((item) => !item.label.toLowerCase().includes(query.toLowerCase())) && matching.length === 0 ? <div className="px-3 py-8 text-center text-sm text-muted-foreground">No commands or workspaces found.</div> : null}</div></div></div>;
}

function AppShell({ children, workspaces, onNewWorkspace, onCommand }: { children: ReactNode; workspaces: Workspace[]; onNewWorkspace: () => void; onCommand: () => void }) {
  return <div className="tv-shell tv-noise flex min-h-[100dvh]"><Sidebar onNewWorkspace={onNewWorkspace} workspaces={workspaces} /><div className="min-w-0 flex-1"><Topbar onCommand={onCommand} />{children}</div></div>;
}

function AppContent({ callbacks = {} }: { callbacks?: TabVaultCallbacks }) {
  const initial = useMemo(readState, []);
  const [state, setState] = useState<PersistedState>(initial);
  const [theme, setTheme] = useState<Theme>(initial.settings.theme);
  const [workspaceForm, setWorkspaceForm] = useState<{ open: boolean; editing?: Workspace }>({ open: false });
  const [commandOpen, setCommandOpen] = useState(false);
  const [location, setLocation] = useLocation();
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);
  useEffect(() => { const root = document.documentElement; const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); root.classList.toggle('dark', dark); localStorage.setItem('tabvault-theme', theme); }, [theme]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandOpen(true); } if (event.key === 'Escape') setCommandOpen(false); }; window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler); }, []);
  const addActivity = (item: Omit<ActivityItem, 'id' | 'createdAt'>) => setState((current) => ({ ...current, activity: [{ ...item, id: createId('activity'), createdAt: now() }, ...current.activity].slice(0, 50) }));
  const openNewWorkspace = () => setWorkspaceForm({ open: true });
  const saveWorkspace = (name: string, description: string, accent: string) => {
    if (workspaceForm.editing) {
      const updated = { ...workspaceForm.editing, name, description, accent, updatedAt: now() };
      setState((current) => ({ ...current, workspaces: current.workspaces.map((item) => item.id === updated.id ? updated : item) }));
      callbacks.onUpdateWorkspace?.(updated);
      addActivity({ type: 'updated', workspaceId: updated.id, label: `Updated ${updated.name}` });
    } else {
      const created: Workspace = { id: createId('workspace'), name, description, accent, createdAt: now(), updatedAt: now(), tabs: [], groups: [], notes: '', snapshots: [] };
      setState((current) => ({ ...current, workspaces: [created, ...current.workspaces] }));
      callbacks.onCreateWorkspace?.(created);
      addActivity({ type: 'created', workspaceId: created.id, label: `Created ${created.name}` });
    }
    setWorkspaceForm({ open: false });
  };
  const deleteWorkspace = (workspace: Workspace) => { if (!window.confirm(`Delete “${workspace.name}” and its local tabs?`)) return; setState((current) => ({ ...current, workspaces: current.workspaces.filter((item) => item.id !== workspace.id) })); callbacks.onDeleteWorkspace?.(workspace.id); addActivity({ type: 'deleted', workspaceId: workspace.id, label: `Deleted ${workspace.name}` }); if (location.startsWith(`/workspace/${workspace.id}`)) setLocation('/'); };
  const duplicateWorkspace = (workspace: Workspace) => { const duplicated: Workspace = { ...workspace, id: createId('workspace'), name: `${workspace.name} copy`, createdAt: now(), updatedAt: now(), lastOpenedAt: undefined, tabs: workspace.tabs.map((tab) => ({ ...tab, id: createId('tab') })), snapshots: [] }; setState((current) => ({ ...current, workspaces: [duplicated, ...current.workspaces] })); callbacks.onDuplicateWorkspace?.(duplicated); addActivity({ type: 'created', workspaceId: duplicated.id, label: `Duplicated ${workspace.name}` }); };
  const updateWorkspace = (workspaceId: string, updater: (workspace: Workspace) => Workspace) => setState((current) => ({ ...current, workspaces: current.workspaces.map((item) => item.id === workspaceId ? updater(item) : item) }));
  const addTab = (workspace: Workspace, values: { url: string; title: string; note: string; pinned: boolean; groupId?: string }) => { const tab: TabRecord = { id: createId('tab'), url: values.url, title: values.title, domain: getDomain(values.url), note: values.note, pinned: values.pinned, groupId: values.groupId, createdAt: now() }; updateWorkspace(workspace.id, (item) => ({ ...item, tabs: [...item.tabs, tab], updatedAt: now() })); addActivity({ type: 'updated', workspaceId: workspace.id, label: `Added ${tab.title}` }); };
  const updateTab = (workspace: Workspace, tab: TabRecord, patch: Partial<TabRecord>) => updateWorkspace(workspace.id, (item) => ({ ...item, tabs: item.tabs.map((candidate) => candidate.id === tab.id ? { ...candidate, ...patch } : candidate), updatedAt: now() }));
  const deleteTab = (workspace: Workspace, tab: TabRecord) => { if (!window.confirm(`Remove “${tab.title}” from this workspace?`)) return; updateWorkspace(workspace.id, (item) => ({ ...item, tabs: item.tabs.filter((candidate) => candidate.id !== tab.id), updatedAt: now() })); addActivity({ type: 'updated', workspaceId: workspace.id, label: `Removed ${tab.title}` }); };
  const createGroup = (workspace: Workspace, name: string) => { const group: GroupRecord = { id: createId('group'), name, collapsed: false }; updateWorkspace(workspace.id, (item) => ({ ...item, groups: [...item.groups, group], updatedAt: now() })); addActivity({ type: 'updated', workspaceId: workspace.id, label: `Created group ${name}` }); };
  const toggleGroup = (workspace: Workspace, groupId: string) => updateWorkspace(workspace.id, (item) => ({ ...item, groups: item.groups.map((group) => group.id === groupId ? { ...group, collapsed: !group.collapsed } : group) }));
  const createSnapshot = (workspace: Workspace) => { const snapshot: Snapshot = { id: createId('snapshot'), label: `Snapshot · ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date())}`, createdAt: now(), tabIds: workspace.tabs.map((tab) => tab.id) }; updateWorkspace(workspace.id, (item) => ({ ...item, snapshots: [snapshot, ...item.snapshots], updatedAt: now() })); addActivity({ type: 'snapshot', workspaceId: workspace.id, label: `Saved ${snapshot.label}` }); };
  const restoreSnapshot = (workspace: Workspace, snapshot: Snapshot) => { callbacks.onRestoreSnapshot?.(snapshot, workspace); addActivity({ type: 'restored', workspaceId: workspace.id, label: `Restored ${snapshot.label}` }); };
  const restoreTab = (workspace: Workspace, tab: TabRecord) => { callbacks.onRestoreTab?.(tab, workspace); updateWorkspace(workspace.id, (item) => ({ ...item, lastOpenedAt: now(), updatedAt: now() })); addActivity({ type: 'restored', workspaceId: workspace.id, label: `Restored ${tab.title}` }); };
  const exportData = () => { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tabvault-export-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); };
  const importData = (file: File) => { const reader = new FileReader(); reader.onload = () => { try { const imported = JSON.parse(String(reader.result)) as PersistedState; if (!Array.isArray(imported.workspaces)) throw new Error('Invalid archive'); setState({ workspaces: imported.workspaces, activity: Array.isArray(imported.activity) ? imported.activity : [], settings: { ...defaultSettings, ...(imported.settings || {}) } }); addActivity({ type: 'imported', label: 'Imported local archive' }); } catch { window.alert('That file is not a valid TabVault archive.'); } }; reader.readAsText(file); };
  const resetData = () => { if (window.confirm('Clear every local workspace, tab, note, and snapshot?')) { setState({ workspaces: [], activity: [], settings: defaultSettings }); setTheme('light'); } };
  const updateSettings = (patch: Partial<Settings>) => { const next = { ...state.settings, ...patch }; setState((current) => ({ ...current, settings: next })); if (patch.theme) setTheme(patch.theme); callbacks.onSettingsChange?.(next); };
  return <ErrorBoundary resetKey={location}><Switch><Route path="/popup"><PopupPage workspaces={state.workspaces} onCapture={() => callbacks.onCaptureWindow?.()} onNewWorkspace={openNewWorkspace} /></Route><Route><AppShell workspaces={state.workspaces} onNewWorkspace={openNewWorkspace} onCommand={() => setCommandOpen(true)}><Switch><Route path="/"><DashboardPage workspaces={state.workspaces} activity={state.activity} onNewWorkspace={openNewWorkspace} onEditWorkspace={(workspace) => setWorkspaceForm({ open: true, editing: workspace })} onDuplicateWorkspace={duplicateWorkspace} onDeleteWorkspace={deleteWorkspace} onCommand={() => setCommandOpen(true)} /></Route><Route path="/workspace/:id"><WorkspaceDetailPage workspaces={state.workspaces} activity={state.activity} onBack={() => setLocation('/')} onEdit={(workspace) => setWorkspaceForm({ open: true, editing: workspace })} onDuplicate={duplicateWorkspace} onDelete={deleteWorkspace} onAddTab={addTab} onUpdateTab={updateTab} onDeleteTab={deleteTab} onCreateGroup={createGroup} onToggleGroup={toggleGroup} onCreateSnapshot={createSnapshot} onRestoreSnapshot={restoreSnapshot} onRestoreTab={restoreTab} onUpdateNotes={(workspace, notes) => updateWorkspace(workspace.id, (item) => ({ ...item, notes, updatedAt: now() }))} /></Route><Route path="/settings"><SettingsPage settings={state.settings} onSettingsChange={updateSettings} onExport={exportData} onImport={importData} onReset={resetData} /></Route><Route component={NotFound} /></Switch></AppShell></Route></Switch>{workspaceForm.open ? <WorkspaceFormModal editing={workspaceForm.editing} onClose={() => setWorkspaceForm({ open: false })} onSave={saveWorkspace} /> : null}{commandOpen ? <CommandPalette workspaces={state.workspaces} onClose={() => setCommandOpen(false)} onNewWorkspace={openNewWorkspace} /> : null}</ErrorBoundary>;
}

const queryClient = new QueryClient();

function App({ callbacks }: { callbacks?: TabVaultCallbacks }) {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><AppContent callbacks={callbacks} /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;