import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import LoginPage from "./pages/LoginPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import DashboardPage from "./pages/DashboardPage";
import ELogBookLandingPage from "./pages/ELogBookLandingPage";
import ELogBookPage from "./pages/ELogBookPage";
import BoilerLogBookPage from "./pages/BoilerLogBookPage";
import ChemicalLogBookPage from "./pages/ChemicalLogBookPage";
import ChemicalHomePage from "./pages/ChemicalHomePage";
import ChemicalStockPage from "./pages/ChemicalStockPage";
import ChemicalAssignmentPage from "./pages/ChemicalAssignmentPage";
import FilterLogBookPage from "./pages/FilterLogBookPage";
import FilterLogBookHomePage from "./pages/FilterLogBookHomePage";
import FilterLogBookSettingsPage from "./pages/FilterLogBookSettingsPage";
import FilterCategoriesPage from "./pages/FilterCategoriesPage";
import FilterRegisterPage from "./pages/FilterRegisterPage";
import FilterScheduleApprovalsPage from "./pages/FilterScheduleApprovalsPage";
import HVACValidationPage from "./pages/HVACValidationPage";
import AirVelocityTestPage from "./pages/AirVelocityTestPage";
import FilterIntegrityTestPage from "./pages/FilterIntegrityTestPage";
import RecoveryTestPage from "./pages/RecoveryTestPage";
import DifferentialPressureTestPage from "./pages/DifferentialPressureTestPage";
import NVPCTestPage from "./pages/NVPCTestPage";
import InstrumentsPage from "./pages/InstrumentsPage";
import DepartmentsPage from "./pages/DepartmentsPage";
import EquipmentCategoriesPage from "./pages/EquipmentCategoriesPage";
import EquipmentListPage from "./pages/EquipmentListPage";
import EquipmentMasterLandingPage from "./pages/EquipmentMasterLandingPage";
import ReportsPage from "./pages/ReportsPage";
import TrendsPage from "./pages/TrendsPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import ChangePasswordPage from "./pages/ChangePasswordPage";
import LogbookBuilderPage from "./pages/LogbookBuilderPage";
import ConsumptionPage from "./pages/ConsumptionPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const isFilterAdmin = (role?: string) =>
  role === "admin" || role === "super_admin";

const isChemicalAdmin = (role?: string) =>
  role === "admin" || role === "super_admin";

function AdminFilterLandingRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user || !isFilterAdmin(user.role)) {
    return <Navigate to="/e-log-book/filter/entry" replace />;
  }
  return <FilterLogBookHomePage />;
}

function AdminFilterSettingsRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user || !isFilterAdmin(user.role)) {
    return <Navigate to="/e-log-book/filter/entry" replace />;
  }
  return <FilterLogBookSettingsPage />;
}

function ChemicalLandingRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;
  if (!user || !isChemicalAdmin(user.role)) {
    return <Navigate to="/e-log-book/chemical/entry" replace />;
  }
  return <ChemicalHomePage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            <Route element={<DashboardLayout />}>
              <Route path="/change-password" element={<ChangePasswordPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/e-log-book" element={<ELogBookLandingPage />} />
              <Route path="/e-log-book/chiller" element={<ELogBookPage equipmentType="chiller" />} />
              <Route path="/e-log-book/boiler" element={<BoilerLogBookPage />} />
              <Route path="/e-log-book/consumption" element={<ConsumptionPage />} />
              <Route path="/e-log-book/chemical" element={<ChemicalLandingRoute />} />
              <Route path="/e-log-book/chemical/entry" element={<ChemicalLogBookPage />} />
              <Route path="/e-log-book/chemical/stock" element={<ChemicalStockPage />} />
              <Route path="/e-log-book/chemical/assignment" element={<ChemicalAssignmentPage />} />
              <Route path="/e-log-book/filter" element={<AdminFilterLandingRoute />} />
              <Route path="/e-log-book/filter/entry" element={<FilterLogBookPage />} />
              <Route path="/e-log-book/filter/settings" element={<AdminFilterSettingsRoute />} />
              <Route path="/e-log-book/filter/settings/categories" element={<FilterCategoriesPage />} />
              <Route path="/e-log-book/filter/settings/register" element={<FilterRegisterPage />} />
              <Route path="/e-log-book/filter/settings/schedules" element={<FilterScheduleApprovalsPage />} />
              <Route path="/hvac-validation" element={<HVACValidationPage />} />
              <Route path="/hvac-validation/air-velocity-test" element={<AirVelocityTestPage />} />
              <Route path="/hvac-validation/filter-integrity-test" element={<FilterIntegrityTestPage />} />
              <Route path="/hvac-validation/recovery-test" element={<RecoveryTestPage />} />
              <Route path="/hvac-validation/differential-pressure-test" element={<DifferentialPressureTestPage />} />
              <Route path="/hvac-validation/nvpc-test" element={<NVPCTestPage />} />
              <Route path="/instruments" element={<InstrumentsPage />} />
              <Route path="/equipment" element={<EquipmentMasterLandingPage />} />
              <Route path="/equipment/departments" element={<DepartmentsPage />} />
              <Route path="/equipment/categories" element={<EquipmentCategoriesPage />} />
              <Route path="/equipment/list" element={<EquipmentListPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/trends" element={<TrendsPage />} />
              <Route path="/logbook-builder" element={<LogbookBuilderPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
