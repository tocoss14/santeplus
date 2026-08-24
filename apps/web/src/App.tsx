import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLE_HOME, useAuth } from './auth';
import { Spinner } from './components/ui';
import PublicLayout from './layouts/PublicLayout';
import AppLayout from './layouts/AppLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Offers from './pages/Offers';
import MemberDashboard from './pages/member/Dashboard';
import SubscribeWizard from './pages/member/SubscribeWizard';
import MyContract from './pages/member/MyContract';
import DigitalCard from './pages/member/DigitalCard';
import Beneficiaries from './pages/member/Beneficiaries';
import ClaimsList from './pages/member/Claims';
import NewClaim from './pages/member/NewClaim';
import ClaimDetail from './pages/member/ClaimDetail';
import ProvidersDirectory from './pages/member/ProvidersDirectory';
import Profile from './pages/shared/Profile';
import Notifications from './pages/shared/Notifications';
import CompanyDashboard from './pages/company/Dashboard';
import Employees from './pages/company/Employees';
import CollectiveContract from './pages/company/CollectiveContract';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminContracts from './pages/admin/AdminContracts';
import AdminProducts from './pages/admin/AdminProducts';
import AdminClaims from './pages/admin/AdminClaims';
import AdminPayments from './pages/admin/AdminPayments';
import AdminProviders from './pages/admin/AdminProviders';
import AdminPartners from './pages/admin/AdminPartners';
import AdminRoles from './pages/admin/AdminRoles';
import AdminAudit from './pages/admin/AdminAudit';
import VerifyCard from './pages/provider/VerifyCard';

function Require({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to="/login" replace />;
  if (!roles.includes(me.role)) return <Navigate to={ROLE_HOME[me.role] ?? '/'} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/offres" element={<Offers />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route path="/app" element={<Require roles={['MEMBER']}><AppLayout /></Require>}>
        <Route index element={<MemberDashboard />} />
        <Route path="souscrire" element={<SubscribeWizard />} />
        <Route path="contrat" element={<MyContract />} />
        <Route path="carte" element={<DigitalCard />} />
        <Route path="beneficiaires" element={<Beneficiaries />} />
        <Route path="remboursements" element={<ClaimsList />} />
        <Route path="remboursements/nouveau" element={<NewClaim />} />
        <Route path="remboursements/:id" element={<ClaimDetail />} />
        <Route path="prestataires" element={<ProvidersDirectory />} />
        <Route path="profil" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/entreprise" element={<Require roles={['COMPANY_ADMIN', 'SUPER_ADMIN']}><AppLayout variant="company" /></Require>}>
        <Route index element={<CompanyDashboard />} />
        <Route path="salaries" element={<Employees />} />
        <Route path="contrat" element={<CollectiveContract />} />
        <Route path="profil" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/admin" element={<Require roles={['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT']}><AppLayout variant="admin" /></Require>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="contracts" element={<AdminContracts />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="claims" element={<AdminClaims />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="providers" element={<AdminProviders />} />
        <Route path="partners" element={<AdminPartners />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="profil" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/prestataire" element={<Require roles={['PROVIDER', 'SUPER_ADMIN']}><AppLayout variant="provider" /></Require>}>
        <Route index element={<VerifyCard />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
