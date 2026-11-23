import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminCostPage } from './pages/AdminCostPage';
import { EmployeeDetailPage } from './pages/EmployeeDetailPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PayrollRunsPage } from './pages/PayrollRunsPage';
import { PayrollRunPage } from './pages/PayrollRunPage';
import { PayslipPage } from './pages/PayslipPage';
import { PolicyPage } from './pages/PolicyPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<PayrollRunsPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:employeeId" element={<EmployeeDetailPage />} />
        <Route path="policy" element={<PolicyPage />} />
        <Route path="runs/:runId" element={<PayrollRunPage />} />
        <Route path="runs/:runId/admin-cost" element={<AdminCostPage />} />
        <Route path="payslips/:payslipId" element={<PayslipPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
