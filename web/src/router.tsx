import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import type { Role } from '@medimate/shared';
import { AppShell, PublicLayout } from './components/layout';
import { EmptyState, LinkButton, Spinner } from './components/ui';
import { hasRole, useMe } from './lib/auth';
import { Lock } from 'lucide-react';

// Route-level code splitting keeps the first load light on slow networks.
const Landing = lazy(() => import('./pages/public/Landing'));
const Find = lazy(() => import('./pages/public/Find'));
const PharmacyDetail = lazy(() => import('./pages/public/PharmacyDetail'));
const Medicines = lazy(() => import('./pages/public/Medicines').then((m) => ({ default: m.MedicinesPage })));
const MedicineDetail = lazy(() => import('./pages/public/Medicines').then((m) => ({ default: m.MedicineDetailPage })));
const Login = lazy(() => import('./pages/public/Login'));
const Legal = lazy(() => import('./pages/public/Legal'));
const Simulator = lazy(() => import('./pages/public/Simulator'));

const Dashboard = lazy(() => import('./pages/app/Dashboard'));
const Onboarding = lazy(() => import('./pages/app/Onboarding'));
const Reminders = lazy(() => import('./pages/app/Reminders'));
const Plans = lazy(() => import('./pages/app/Plans').then((m) => ({ default: m.PlansPage })));
const PlanForm = lazy(() => import('./pages/app/Plans').then((m) => ({ default: m.PlanFormPage })));
const Checkups = lazy(() => import('./pages/app/Checkups'));
const Health = lazy(() => import('./pages/app/Health'));
const Activity = lazy(() => import('./pages/app/Activity').then((m) => ({ default: m.StepsPage })));
const Water = lazy(() => import('./pages/app/Activity').then((m) => ({ default: m.WaterPage })));
const Progress = lazy(() => import('./pages/app/Progress'));
const History = lazy(() => import('./pages/app/History'));
const Care = lazy(() => import('./pages/app/Care'));
const Messages = lazy(() => import('./pages/app/Messages').then((m) => ({ default: m.MessagesPage })));
const ThreadPage = lazy(() => import('./pages/app/Messages').then((m) => ({ default: m.ThreadPage })));
const Assistant = lazy(() => import('./pages/app/Assistant'));
const Me = lazy(() => import('./pages/app/Me'));
const Notifications = lazy(() => import('./pages/app/Notifications'));
const Settings = lazy(() => import('./pages/app/Settings'));
const Billing = lazy(() => import('./pages/app/Billing').then((m) => ({ default: m.BillingPage })));
const BillingReturn = lazy(() => import('./pages/app/Billing').then((m) => ({ default: m.BillingReturnPage })));

const CaretakerHome = lazy(() => import('./pages/care/Caretaker').then((m) => ({ default: m.CaretakerHome })));
const CaretakerPatient = lazy(() => import('./pages/care/Caretaker').then((m) => ({ default: m.CaretakerPatient })));

const PharmacyHome = lazy(() => import('./pages/pharmacy/Portal').then((m) => ({ default: m.PortalHome })));
const PharmacyStock = lazy(() => import('./pages/pharmacy/Portal').then((m) => ({ default: m.StockPage })));
const PharmacyImport = lazy(() => import('./pages/pharmacy/Portal').then((m) => ({ default: m.ImportPage })));
const PharmacyInbox = lazy(() => import('./pages/pharmacy/Portal').then((m) => ({ default: m.InboxPage })));
const PharmacyProfile = lazy(() => import('./pages/pharmacy/Portal').then((m) => ({ default: m.ProfilePage })));
const PharmacyRegister = lazy(() => import('./pages/pharmacy/Portal').then((m) => ({ default: m.RegisterPage })));

const AdminHome = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminHome })));
const AdminPharmacies = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminPharmacies })));
const AdminMedicines = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminMedicines })));
const AdminTips = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminTips })));
const AdminReports = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminReports })));
const AdminUsers = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminUsers })));
const AdminSettings = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminSettings })));
const AdminLogs = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminLogs })));
const AdminAudit = lazy(() => import('./pages/admin/Admin').then((m) => ({ default: m.AdminAudit })));

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const me = useMe();
  const loc = useLocation();
  if (me.isPending) return <Spinner full />;
  if (!me.data) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!me.data.onboarded && loc.pathname !== '/app/onboarding') return <Navigate to="/app/onboarding" replace />;
  if (roles && !hasRole(me.data, ...roles)) {
    return (
      <EmptyState icon={Lock} title="This area is not part of your account" action={<LinkButton to="/app">Go to my overview</LinkButton>}>
        Access is based on your role. Ask an administrator if you think this is wrong.
      </EmptyState>
    );
  }
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-20">
      <EmptyState title="Page not found" action={<LinkButton to="/">Go home</LinkButton>}>
        The page you are looking for does not exist or has moved.
      </EmptyState>
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Spinner full />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route index element={<Landing />} />
            <Route path="find" element={<Find />} />
            <Route path="pharmacies/:id" element={<PharmacyDetail />} />
            <Route path="medicines" element={<Medicines />} />
            <Route path="medicines/:id" element={<MedicineDetail />} />
            <Route path="login" element={<Login />} />
            <Route path="simulator" element={<Simulator />} />
            <Route path="privacy" element={<Legal page="privacy" />} />
            <Route path="terms" element={<Legal page="terms" />} />
            <Route path="safety" element={<Legal page="safety" />} />
            <Route path="support" element={<Legal page="support" />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route
            path="app/onboarding"
            element={
              <RequireAuth>
                <Onboarding />
              </RequireAuth>
            }
          />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route path="app" element={<Dashboard />} />
            <Route path="app/reminders" element={<Reminders />} />
            <Route path="app/medicines" element={<Plans />} />
            <Route path="app/medicines/new" element={<PlanForm />} />
            <Route path="app/medicines/:id" element={<PlanForm />} />
            <Route path="app/checkups" element={<Checkups />} />
            <Route path="app/health" element={<Health />} />
            <Route path="app/activity" element={<Activity />} />
            <Route path="app/water" element={<Water />} />
            <Route path="app/progress" element={<Progress />} />
            <Route path="app/history" element={<History />} />
            <Route path="app/care" element={<Care />} />
            <Route path="app/messages" element={<Messages />} />
            <Route path="app/messages/:id" element={<ThreadPage />} />
            <Route path="app/assistant" element={<Assistant />} />
            <Route path="app/me" element={<Me />} />
            <Route path="app/notifications" element={<Notifications />} />
            <Route path="app/settings" element={<Settings />} />
            <Route path="app/billing" element={<Billing />} />
            <Route path="app/billing/return" element={<BillingReturn />} />
            <Route path="care" element={<CaretakerHome />} />
            <Route path="care/:patientId" element={<CaretakerPatient />} />
            <Route path="pharmacy/register" element={<PharmacyRegister />} />
            <Route path="pharmacy" element={<RequireAuth roles={['pharmacy']}><PharmacyHome /></RequireAuth>} />
            <Route path="pharmacy/stock" element={<RequireAuth roles={['pharmacy']}><PharmacyStock /></RequireAuth>} />
            <Route path="pharmacy/import" element={<RequireAuth roles={['pharmacy']}><PharmacyImport /></RequireAuth>} />
            <Route path="pharmacy/inbox" element={<RequireAuth roles={['pharmacy']}><PharmacyInbox /></RequireAuth>} />
            <Route path="pharmacy/inbox/:id" element={<RequireAuth roles={['pharmacy']}><ThreadPage /></RequireAuth>} />
            <Route path="pharmacy/profile" element={<RequireAuth roles={['pharmacy']}><PharmacyProfile /></RequireAuth>} />
            <Route path="admin" element={<RequireAuth roles={['admin', 'reviewer']}><AdminHome /></RequireAuth>} />
            <Route path="admin/pharmacies" element={<RequireAuth roles={['admin']}><AdminPharmacies /></RequireAuth>} />
            <Route path="admin/medicines" element={<RequireAuth roles={['admin', 'reviewer']}><AdminMedicines /></RequireAuth>} />
            <Route path="admin/tips" element={<RequireAuth roles={['admin', 'reviewer']}><AdminTips /></RequireAuth>} />
            <Route path="admin/reports" element={<RequireAuth roles={['admin']}><AdminReports /></RequireAuth>} />
            <Route path="admin/users" element={<RequireAuth roles={['admin']}><AdminUsers /></RequireAuth>} />
            <Route path="admin/settings" element={<RequireAuth roles={['admin']}><AdminSettings /></RequireAuth>} />
            <Route path="admin/logs" element={<RequireAuth roles={['admin']}><AdminLogs /></RequireAuth>} />
            <Route path="admin/audit" element={<RequireAuth roles={['admin']}><AdminAudit /></RequireAuth>} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
