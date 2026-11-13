import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import {
  BookOpen,
  Box,
  Database,
  ExternalLink,
  FolderKanban,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Settings2,
  SlidersHorizontal,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { calculationRateLink } from '@/utils/calculationSettingsLinks';
import { getOperatorProfile } from '@/utils/storage';
import { SidebarArtwork } from './SidebarArtwork';
import './layout.css';
import { demoAsset } from '@/demo/config';

const pageTitles: Array<{ match: (path: string) => boolean; title: string; icon: LucideIcon }> = [
  { match: path => path.startsWith('/models'), title: '3D-модели', icon: Box },
  { match: (path) => /\/runs\/[^/]+\/(?:estimate|route)(?:\/|$)/.test(path), title: 'Документы детали', icon: FolderKanban },
  { match: (path) => path.startsWith('/runs/'), title: 'Рабочее пространство', icon: FolderKanban },
  { match: (path) => /^\/projects\/[^/]+/.test(path), title: 'Карточка проекта', icon: FolderKanban },
  { match: (path) => path.startsWith('/catalog'), title: 'Справочник НСИ', icon: BookOpen },
  { match: (path) => path.startsWith('/equipment-configurator'), title: 'Конфигуратор оборудования', icon: Settings2 },
  { match: (path) => path.startsWith('/equipment'), title: 'Оборудование', icon: Wrench },
  { match: (path) => path.startsWith('/calculation-settings'), title: 'Настройки расчёта', icon: SlidersHorizontal },
  { match: (path) => path.startsWith('/settings'), title: 'Настройки', icon: Settings },
  { match: () => true, title: 'Проекты', icon: FolderKanban },
];

const externalTools = [
  {
    label: 'Создать 3D',
    href: demoAsset('#/models'),
    title: 'Открыть готовые 3D-модели CAD-Metall',
    icon: Box,
  },
  {
    label: 'Марочник Splav',
    href: demoAsset('#/catalog?section=materials'),
    title: 'Открыть демонстрационный справочник материалов',
    icon: Database,
  },
];

type SidebarContentProps = {
  pathname: string;
  runId?: string;
  mobile?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
  closeButtonRef?: React.RefObject<HTMLButtonElement | null>;
};

function SidebarContent({ pathname, runId, mobile = false, onNavigate, onClose, closeButtonRef }: SidebarContentProps) {
  const idPrefix = mobile ? 'mobile' : 'desktop';
  const navGroups = [
    {
      id: 'workspace',
      label: 'Рабочее пространство',
      links: [{ to: '/projects', label: 'Проекты', icon: FolderKanban }],
    },
    {
      id: 'resources',
      label: 'Ресурсы',
      links: [
        { to: '/catalog', label: 'Справочник НСИ', icon: BookOpen },
        { to: '/equipment', label: 'Оборудование', icon: Wrench },
        { to: '/equipment-configurator', label: 'Конфигуратор оборудования', icon: Settings2 },
      ],
    },
    {
      id: 'settings',
      label: 'Настройки',
      links: [
        { to: '/calculation-settings', destination: runId ? calculationRateLink(runId) : '/calculation-settings', label: 'Настройки расчёта', icon: SlidersHorizontal },
        { to: '/settings', label: 'Настройки', icon: Settings },
      ],
    },
  ];

  return (
    <>
      <SidebarArtwork />
      <div className="sidebar-head">
        <Link className="brand" to="/projects" aria-label="Metall — рабочее пространство" title="Metall — рабочее пространство" onClick={onNavigate}>
          <span className="brand-mark" aria-hidden="true">M</span>
          <span className="brand-text">
            <strong>Metall</strong>
            <small>Рабочее пространство</small>
          </span>
        </Link>
        {mobile && (
          <button ref={closeButtonRef} className="sidebar-close" type="button" onClick={onClose} aria-label="Закрыть меню" title="Закрыть меню">
            <X size={20} aria-hidden="true" />
          </button>
        )}
      </div>

      <nav className="sidebar-scroll nav-list" aria-label="Разделы Metall">
        {navGroups.map(group => (
          <section className="nav-group" key={group.id} aria-labelledby={`${idPrefix}-nav-${group.id}`}>
            <h2 className="nav-label" id={`${idPrefix}-nav-${group.id}`}>{group.label}</h2>
            <ul className="nav-links">
              {group.links.map(({ to, destination, label, icon: Icon }) => {
                const isActive = pathname === to || pathname.startsWith(to + '/');
                return (
                  <li key={to}>
                    <Link to={destination ?? to} aria-current={isActive ? 'page' : undefined} aria-label={label} title={label}
                      className={`nav-item ${isActive ? 'is-active' : ''}`} onClick={onNavigate}>
                      <Icon className="nav-icon" aria-hidden="true" />
                      <span className="nav-text">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div className="sidebar-footer">
        <p className="nav-label">Инструменты</p>
        <nav className="sidebar-footlinks" aria-label="Внешние инструменты">
          <ul className="nav-links">
            {externalTools.map(({ label, href, title, icon: Icon }) => (
              <li key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="nav-item nav-item-external"
                  title={title} aria-label={`${label} — в новой вкладке`} onClick={onNavigate}>
                  <Icon className="nav-icon" aria-hidden="true" />
                  <span className="nav-text">{label}</span>
                  <ExternalLink className="nav-external-icon" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}

export const Header: React.FC = () => {
  const location = useLocation();
  const runId = useMatch({ path: '/runs/:runId', end: false })?.params.runId;
  const [operator, setOperator] = useState(getOperatorProfile);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuDialog = useRef<HTMLDialogElement>(null);
  const openMenuButton = useRef<HTMLButtonElement>(null);
  const closeMenuButton = useRef<HTMLButtonElement>(null);
  const sidebarToggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleStorage = () => setOperator(getOperatorProfile());
    window.addEventListener('operator-profile-changed', handleStorage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('operator-profile-changed', handleStorage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    menuDialog.current?.close();
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)');
    const closeOnDesktop = () => {
      if (desktop.matches) menuDialog.current?.close();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);

  function openMenu() {
    const dialog = menuDialog.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    setIsMenuOpen(true);
    closeMenuButton.current?.focus({ preventScroll: true });
  }

  function closeMenu() {
    menuDialog.current?.close();
  }

  function handleMenuClosed() {
    setIsMenuOpen(false);
    const trigger = window.matchMedia('(max-width: 900px)').matches ? openMenuButton : sidebarToggle;
    trigger.current?.focus({ preventScroll: true });
  }

  const page = pageTitles.find(({ match }) => match(location.pathname))!;
  const PageIcon = page.icon;

  return (
    <>
      <aside id="app-sidebar" className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`} aria-label="Основная навигация">
        <SidebarContent pathname={location.pathname} runId={runId} />
      </aside>

      <header className="topbar" aria-label="Текущий раздел и профиль">
        <div className="topbar-heading">
          <button ref={openMenuButton} className="menu-button" type="button" onClick={openMenu}
            aria-controls="app-navigation-dialog" aria-expanded={isMenuOpen} aria-haspopup="dialog" aria-label="Открыть меню" title="Открыть меню">
            <Menu size={20} aria-hidden="true" />
          </button>
          <button ref={sidebarToggle} className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed(value => !value)}
            aria-controls="app-sidebar" aria-expanded={!sidebarCollapsed}
            aria-label={sidebarCollapsed ? 'Раскрыть сайдбар' : 'Свернуть сайдбар'}
            title={sidebarCollapsed ? 'Раскрыть сайдбар' : 'Свернуть сайдбар'}>
            {sidebarCollapsed ? <PanelLeftOpen size={20} aria-hidden="true" /> : <PanelLeftClose size={20} aria-hidden="true" />}
          </button>
          <span className="topbar-symbol" aria-hidden="true"><PageIcon size={22} /></span>
          <div className="topbar-title">
            <h1 title={page.title}>{page.title}</h1>
            <p className="eyebrow">Рабочее пространство Metall</p>
          </div>
        </div>
        <div className="topbar-actions">
          <Link className="operator-chip" to="/settings/profile" aria-label={`Настройки профиля · ${operator.name}`}>
            <span className="operator-avatar" aria-hidden="true">{operator.name.charAt(0).toUpperCase()}</span>
            <span className="operator-details">
              <strong>{operator.name}</strong>
              <small>{operator.organization || operator.workstation}</small>
            </span>
          </Link>
        </div>
      </header>

      <dialog ref={menuDialog} id="app-navigation-dialog" className="navigation-dialog" aria-label="Основная навигация" onClose={handleMenuClosed}
        onClick={event => {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.target === event.currentTarget && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) closeMenu();
        }}>
        <aside className="sidebar mobile-sidebar" aria-label="Меню Metall">
          <SidebarContent pathname={location.pathname} runId={runId} mobile onNavigate={closeMenu} onClose={closeMenu} closeButtonRef={closeMenuButton} />
        </aside>
      </dialog>
    </>
  );
};
