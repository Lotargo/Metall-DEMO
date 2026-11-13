import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Header } from '@/components/layout/Header';
const ProjectsPage = React.lazy(() => import('@/pages/ProjectsPage').then(module => ({ default: module.ProjectsPage })));
const ProjectDetailPage = React.lazy(() => import('@/pages/ProjectDetailPage').then(module => ({ default: module.ProjectDetailPage })));
const RunWorkspacePage = React.lazy(() => import('@/pages/RunWorkspacePage').then(module => ({ default: module.RunWorkspacePage })));
const RunEstimatePage = React.lazy(() => import('@/pages/RunEstimatePage').then(module => ({ default: module.RunEstimatePage })));
const RunFullRoutePage = React.lazy(() => import('@/pages/RunFullRoutePage').then(module => ({ default: module.RunFullRoutePage })));
const RunEstimatePrintPage = React.lazy(() => import('@/pages/RunEstimatePrintPage').then(module => ({ default: module.RunEstimatePrintPage })));
const CatalogPage = React.lazy(() => import('@/pages/CatalogPage').then(module => ({ default: module.CatalogPage })));
const EquipmentPage = React.lazy(() => import('@/pages/EquipmentPage').then(module => ({ default: module.EquipmentPage })));
const EquipmentConfiguratorPage = React.lazy(() => import('@/pages/EquipmentConfiguratorPage').then(module => ({ default: module.EquipmentConfiguratorPage })));
const CalculationSettingsPage = React.lazy(() => import('@/pages/CalculationSettingsPage').then(module => ({ default: module.CalculationSettingsPage })));
const SettingsPage = React.lazy(() => import('@/pages/SettingsPage').then(module => ({ default: module.SettingsPage })));

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { DemoToolbar } from '@/demo/DemoToolbar';
const ModelsPage = React.lazy(() => import('@/demo/ModelsPage').then(module => ({ default: module.ModelsPage })));

// Configure TanStack Query Client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5000,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <div className="app-shell">
          <Header />
          <main className="app-main">
            <DemoToolbar />
            <ErrorBoundary>
              <React.Suspense fallback={<p className="content" role="status">Загрузка раздела…</p>}>
              <Routes>
                <Route path="/" element={<Navigate to="/projects" replace />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/runs/:runId" element={<RunWorkspacePage />} />
                <Route path="/runs/:runId/estimate" element={<RunEstimatePage />} />
                <Route path="/runs/:runId/estimate/print" element={<RunEstimatePrintPage />} />
                <Route path="/runs/:runId/route" element={<RunFullRoutePage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/equipment" element={<EquipmentPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/equipment-configurator" element={<EquipmentConfiguratorPage />} />
                <Route path="/calculation-settings" element={<Navigate to="rates" replace />} />
                <Route path="/calculation-settings/:section" element={<CalculationSettingsPage />} />
                <Route path="/settings" element={<Navigate to="agents" replace />} />
                <Route path="/settings/:section" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/projects" replace />} />
              </Routes>
              </React.Suspense>
            </ErrorBoundary>
          </main>
        </div>
      </HashRouter>
    </QueryClientProvider>
  );
};

export default App;
