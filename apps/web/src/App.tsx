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
import MemberConsultations from './pages/member/MemberConsultations';
import MemberPrescriptions from './pages/member/MemberPrescriptions';
import CareRecordList from './pages/member/CareRecordList';
import CareRecordDetail from './pages/member/CareRecordDetail';
import MyCareTimeline from './pages/member/MyCareTimeline';
import MyContractUnified from './pages/member/MyContractUnified';
import CompanyDashboard from './pages/company/Dashboard';
import Employees from './pages/company/Employees';
import CollectiveContract from './pages/company/CollectiveContract';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminContracts from './pages/admin/AdminContracts';
import AdminProducts from './pages/admin/AdminProducts';
import AdminActs from './pages/admin/AdminActs';
import AdminClaims from './pages/admin/AdminClaims';
import AdminPayments from './pages/admin/AdminPayments';
import AdminProviders from './pages/admin/AdminProviders';
import AdminPartners from './pages/admin/AdminPartners';
import AdminRoles from './pages/admin/AdminRoles';
import AdminAudit from './pages/admin/AdminAudit';
import AdminTechnicalResult from './pages/admin/AdminTechnicalResult';
import RegisterProvider from './pages/RegisterProvider';
import CGA from './pages/CGA';
import PublicProvidersDirectory from './pages/PublicProvidersDirectory';
import VerifyCard from './pages/provider/VerifyCard';
import ProviderDashboard from './pages/provider/ProviderDashboard';
import ProviderConsultations from './pages/provider/ProviderConsultations';
import ProviderPrescriptions from './pages/provider/ProviderPrescriptions';
import ProviderDeliveries from './pages/provider/ProviderDeliveries';
import ProviderCareRecords from './pages/provider/ProviderCareRecords';
import NewThirdParty from './pages/provider/NewThirdParty';
import TpList from './pages/provider/TpList';
import TpDetail from './pages/provider/TpDetail';
import ProviderTpUnified from './pages/provider/ProviderTpUnified';
import ProviderActivity from './pages/provider/ProviderActivity';
import ProviderPayments from './pages/provider/ProviderPayments';
import Establishment from './pages/provider/Establishment';
import Staff from './pages/provider/Staff';

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
        <Route path="/cga" element={<CGA />} />
        <Route path="/reseau" element={<PublicProvidersDirectory />} />
      </Route>

      <Route path="/app" element={<Require roles={['MEMBER']}><AppLayout /></Require>}>
        <Route index element={<MemberDashboard />} />
        <Route path="souscrire" element={<SubscribeWizard />} />
        <Route path="contrat" element={<MyContractUnified />} />
        <Route path="contrat-old" element={<MyContract />} />
        <Route path="carte" element={<DigitalCard />} />
        <Route path="soins" element={<MyCareTimeline />} />
        <Route path="soins/:id" element={<CareRecordDetail />} />
        <Route path="ordonnances" element={<MemberPrescriptions />} />
        <Route path="consultations" element={<MemberConsultations />} />
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
        <Route path="acts" element={<AdminActs />} />
        <Route path="claims" element={<AdminClaims />} />
        <Route path="payments" element={<AdminPayments />} />
        <Route path="providers" element={<AdminProviders />} />
        <Route path="partners" element={<AdminPartners />} />
        <Route path="roles" element={<AdminRoles />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="technical-result" element={<AdminTechnicalResult />} />
        <Route path="profil" element={<Profile />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/inscription-prestataire" element={<RegisterProvider />} />

      <Route path="/prestataire" element={<Require roles={['PROVIDER', 'SUPER_ADMIN']}><AppLayout variant="provider" /></Require>}>
        <Route index element={<ProviderDashboard />} />
        <Route path="verifier" element={<VerifyCard />} />
        <Route path="nouvelle" element={<NewThirdParty />} />
        <Route path="activite" element={<ProviderActivity />} />
        <Route path="consultations" element={<ProviderConsultations />} />
        <Route path="ordonnances" element={<ProviderPrescriptions />} />
        <Route path="delivrances" element={<ProviderDeliveries />} />
        <Route path="dossiers" element={<ProviderCareRecords />} />
        <Route path="dossiers/:id" element={<CareRecordDetail />} />
        <Route path="prises" element={<ProviderTpUnified />} />
        <Route path="prises/:id" element={<TpDetail />} />
        <Route path="paiements" element={<ProviderPayments />} />
        <Route path="etablissement" element={<Establishment />} />
        <Route path="personnel" element={<Staff />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="profil" element={<Profile />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
