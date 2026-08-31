import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ROLE_HOME, useAuth } from './auth';
import { Spinner } from './components/ui';
import PublicLayout from './layouts/PublicLayout';
import AppLayout from './layouts/AppLayout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterCompany from './pages/RegisterCompany';

// Lazy — member
const Offers = lazy(() => import('./pages/Offers'));
const MemberDashboard = lazy(() => import('./pages/member/Dashboard'));
const SubscribeWizard = lazy(() => import('./pages/member/SubscribeWizard'));
const MyContract = lazy(() => import('./pages/member/MyContract'));
const DigitalCard = lazy(() => import('./pages/member/DigitalCard'));
const Beneficiaries = lazy(() => import('./pages/member/Beneficiaries'));
const ClaimsList = lazy(() => import('./pages/member/Claims'));
const NewClaim = lazy(() => import('./pages/member/NewClaim'));
const ClaimDetail = lazy(() => import('./pages/member/ClaimDetail'));
const ProvidersDirectory = lazy(() => import('./pages/member/ProvidersDirectory'));
const MemberConsultations = lazy(() => import('./pages/member/MemberConsultations'));
const MemberPrescriptions = lazy(() => import('./pages/member/MemberPrescriptions'));
const CareRecordList = lazy(() => import('./pages/member/CareRecordList'));
const CareRecordDetail = lazy(() => import('./pages/member/CareRecordDetail'));
const MyCareTimeline = lazy(() => import('./pages/member/MyCareTimeline'));
const MyContractUnified = lazy(() => import('./pages/member/MyContractUnified'));
const DistributorDashboard = lazy(() => import('./pages/member/DistributorDashboard'));

// Lazy — company
const CompanyDashboard = lazy(() => import('./pages/company/Dashboard'));
const Employees = lazy(() => import('./pages/company/Employees'));
const CollectiveContract = lazy(() => import('./pages/company/CollectiveContract'));

// Lazy — admin (heavy: recharts)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminContracts = lazy(() => import('./pages/admin/AdminContracts'));
const AdminProducts = lazy(() => import('./pages/admin/AdminProducts'));
const AdminActs = lazy(() => import('./pages/admin/AdminActs'));
const AdminClaims = lazy(() => import('./pages/admin/AdminClaims'));
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments'));
const AdminProviders = lazy(() => import('./pages/admin/AdminProviders'));
const AdminPartners = lazy(() => import('./pages/admin/AdminPartners'));
const AdminRoles = lazy(() => import('./pages/admin/AdminRoles'));
const AdminAudit = lazy(() => import('./pages/admin/AdminAudit'));
const AdminTechnicalResult = lazy(() => import('./pages/admin/AdminTechnicalResult'));
const AdminDistributors = lazy(() => import('./pages/admin/AdminDistributors'));
const AdminCommissions = lazy(() => import('./pages/admin/AdminCommissions'));
const AdminAccounting = lazy(() => import('./pages/admin/AdminAccounting'));
const AdminBranches = lazy(() => import('./pages/admin/AdminBranches'));
const AdminDiseases = lazy(() => import('./pages/admin/AdminDiseases'));

// Lazy — provider
const RegisterProvider = lazy(() => import('./pages/RegisterProvider'));
const CGA = lazy(() => import('./pages/CGA'));
const PublicProvidersDirectory = lazy(() => import('./pages/PublicProvidersDirectory'));
const ReferralRedirect = lazy(() => import('./pages/ReferralRedirect'));
const VerifyCard = lazy(() => import('./pages/provider/VerifyCard'));
const ProviderDashboard = lazy(() => import('./pages/provider/ProviderDashboard'));
const ProviderConsultations = lazy(() => import('./pages/provider/ProviderConsultations'));
const ProviderPrescriptions = lazy(() => import('./pages/provider/ProviderPrescriptions'));
const ProviderDeliveries = lazy(() => import('./pages/provider/ProviderDeliveries'));
const ProviderCareRecords = lazy(() => import('./pages/provider/ProviderCareRecords'));
const HospitalEntente = lazy(() => import('./pages/provider/HospitalEntente'));
const NewThirdParty = lazy(() => import('./pages/provider/NewThirdParty'));
const TpList = lazy(() => import('./pages/provider/TpList'));
const TpDetail = lazy(() => import('./pages/provider/TpDetail'));
const ProviderTpUnified = lazy(() => import('./pages/provider/ProviderTpUnified'));
const ProviderActivity = lazy(() => import('./pages/provider/ProviderActivity'));
const ProviderPayments = lazy(() => import('./pages/provider/ProviderPayments'));
const Establishment = lazy(() => import('./pages/provider/Establishment'));
const Staff = lazy(() => import('./pages/provider/Staff'));

// Shared
const Profile = lazy(() => import('./pages/shared/Profile'));
const Notifications = lazy(() => import('./pages/shared/Notifications'));

function Require({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to="/login" replace />;
  if (!roles.includes(me.role)) return <Navigate to={ROLE_HOME[me.role] ?? '/'} replace />;
  return <>{children}</>;
}

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="grid place-items-center py-16"><Spinner /></div>}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Landing />} />
        <Route path="/offres" element={<Lazy><Offers /></Lazy>} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-entreprise" element={<RegisterCompany />} />
        <Route path="/cga" element={<Lazy><CGA /></Lazy>} />
        <Route path="/reseau" element={<Lazy><PublicProvidersDirectory /></Lazy>} />
        <Route path="/r/:code" element={<Lazy><ReferralRedirect /></Lazy>} />
      </Route>

      <Route path="/app" element={<Require roles={['MEMBER']}><AppLayout /></Require>}>
        <Route index element={<Lazy><MemberDashboard /></Lazy>} />
        <Route path="souscrire" element={<Lazy><SubscribeWizard /></Lazy>} />
        <Route path="contrat" element={<Lazy><MyContractUnified /></Lazy>} />
        <Route path="contrat-old" element={<Lazy><MyContract /></Lazy>} />
        <Route path="carte" element={<Lazy><DigitalCard /></Lazy>} />
        <Route path="soins" element={<Lazy><MyCareTimeline /></Lazy>} />
        <Route path="soins/:id" element={<Lazy><CareRecordDetail /></Lazy>} />
        <Route path="ordonnances" element={<Lazy><MemberPrescriptions /></Lazy>} />
        <Route path="consultations" element={<Lazy><MemberConsultations /></Lazy>} />
        <Route path="beneficiaires" element={<Lazy><Beneficiaries /></Lazy>} />
        <Route path="remboursements" element={<Lazy><ClaimsList /></Lazy>} />
        <Route path="remboursements/nouveau" element={<Lazy><NewClaim /></Lazy>} />
        <Route path="remboursements/:id" element={<Lazy><ClaimDetail /></Lazy>} />
        <Route path="prestataires" element={<Lazy><ProvidersDirectory /></Lazy>} />
        <Route path="distributeur" element={<Lazy><DistributorDashboard /></Lazy>} />
        <Route path="profil" element={<Lazy><Profile /></Lazy>} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
      </Route>

      <Route path="/entreprise" element={<Require roles={['COMPANY_ADMIN', 'SUPER_ADMIN']}><AppLayout variant="company" /></Require>}>
        <Route index element={<Lazy><CompanyDashboard /></Lazy>} />
        <Route path="salaries" element={<Lazy><Employees /></Lazy>} />
        <Route path="contrat" element={<Lazy><CollectiveContract /></Lazy>} />
        <Route path="profil" element={<Lazy><Profile /></Lazy>} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
      </Route>

      <Route path="/admin" element={<Require roles={['SUPER_ADMIN', 'INSURANCE_MANAGER', 'SUPPORT_AGENT']}><AppLayout variant="admin" /></Require>}>
        <Route index element={<Lazy><AdminDashboard /></Lazy>} />
        <Route path="users" element={<Lazy><AdminUsers /></Lazy>} />
        <Route path="contracts" element={<Lazy><AdminContracts /></Lazy>} />
        <Route path="products" element={<Lazy><AdminProducts /></Lazy>} />
        <Route path="acts" element={<Lazy><AdminActs /></Lazy>} />
        <Route path="claims" element={<Lazy><AdminClaims /></Lazy>} />
        <Route path="payments" element={<Lazy><AdminPayments /></Lazy>} />
        <Route path="providers" element={<Lazy><AdminProviders /></Lazy>} />
        <Route path="partners" element={<Lazy><AdminPartners /></Lazy>} />
        <Route path="roles" element={<Lazy><AdminRoles /></Lazy>} />
        <Route path="audit" element={<Lazy><AdminAudit /></Lazy>} />
        <Route path="technical-result" element={<Lazy><AdminTechnicalResult /></Lazy>} />
        <Route path="distributors" element={<Lazy><AdminDistributors /></Lazy>} />
        <Route path="commissions" element={<Lazy><AdminCommissions /></Lazy>} />
        <Route path="accounting" element={<Lazy><AdminAccounting /></Lazy>} />
        <Route path="branches" element={<Lazy><AdminBranches /></Lazy>} />
        <Route path="diseases" element={<Lazy><AdminDiseases /></Lazy>} />
        <Route path="profil" element={<Lazy><Profile /></Lazy>} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
      </Route>

      <Route path="/inscription-prestataire" element={<Lazy><RegisterProvider /></Lazy>} />

      <Route path="/prestataire" element={<Require roles={['PROVIDER', 'SUPER_ADMIN']}><AppLayout variant="provider" /></Require>}>
        <Route index element={<Lazy><ProviderDashboard /></Lazy>} />
        <Route path="verifier" element={<Lazy><VerifyCard /></Lazy>} />
        <Route path="hospitalisation" element={<Lazy><HospitalEntente /></Lazy>} />
        <Route path="nouvelle" element={<Lazy><NewThirdParty /></Lazy>} />
        <Route path="activite" element={<Lazy><ProviderActivity /></Lazy>} />
        <Route path="consultations" element={<Lazy><ProviderConsultations /></Lazy>} />
        <Route path="ordonnances" element={<Lazy><ProviderPrescriptions /></Lazy>} />
        <Route path="delivrances" element={<Lazy><ProviderDeliveries /></Lazy>} />
        <Route path="dossiers" element={<Lazy><ProviderCareRecords /></Lazy>} />
        <Route path="dossiers/:id" element={<Lazy><CareRecordDetail /></Lazy>} />
        <Route path="prises" element={<Lazy><ProviderTpUnified /></Lazy>} />
        <Route path="prises/:id" element={<Lazy><TpDetail /></Lazy>} />
        <Route path="paiements" element={<Lazy><ProviderPayments /></Lazy>} />
        <Route path="etablissement" element={<Lazy><Establishment /></Lazy>} />
        <Route path="personnel" element={<Lazy><Staff /></Lazy>} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
        <Route path="profil" element={<Lazy><Profile /></Lazy>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
