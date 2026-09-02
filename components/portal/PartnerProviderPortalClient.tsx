'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import OnboardingAssetsPanel from '@/components/portal/OnboardingAssetsPanel';
import { validateAndNormalizeDocumentFile } from '@/lib/security/document-validation';

type PortalMode = 'partner' | 'provider';
type Lang = 'ar' | 'en';

type ProfileData = {
  id?: string;
  company_name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  commercial_registration?: string;
  tax_number?: string;
  iban?: string;
  reviewStatus?: string;
  status?: string;
  shield_level?: string;
};

type PartnerDocument = {
  id: string;
  document_type: string;
  status?: string | null;
  verified?: boolean | null;
  created_at?: string | null;
};

type ProductAvailabilityRow = {
  id: string;
  city?: string;
  available?: boolean;
  products?: {
    id: string;
    name_ar?: string;
    name_en?: string;
    city?: string;
    base_price?: number;
    currency?: string;
    status?: string;
    product_images?: ProductImage[];
  } | null;
};

type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  caption?: string | null;
  sort_order?: number | null;
  created_at?: string | null;
};

type EditableProduct = {
  productId: string;
  nameAr: string;
  nameEn: string;
  city: string;
  basePrice: string;
  currency: string;
  status: string;
};

type BookingRow = {
  id: string;
  booking_reference?: string;
  status?: string;
  total_amount?: number | null;
  total_price?: number | null;
  currency?: string | null;
  guest_name?: string | null;
  product_name?: string | null;
  created_at?: string;
};

type SettlementRow = {
  id: string;
  amount: number;
  currency?: string | null;
  settlement_status?: string | null;
  release_date?: string | null;
  created_at?: string;
};

type ComplianceData = {
  requiredDocuments: string[];
  missingDocuments: string[];
  expiredDocuments: Array<{ documentType: string; expiryDate: string }>;
  pendingReviews: number;
};

const reviewStatusOptions = ['Draft', 'Submitted', 'Needs Changes', 'Approved', 'Suspended'];
const uploadAccept = '.pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp';

const arabicPresentationValues: Record<string, string> = {
  commercial_registration: '?????????? ??????????????',
  registration_commercial: '?????????? ??????????????',
  pending: '?????????????? ????????????????',
  unverified: '?????? ????????',
  pending_review: '?????? ????????????????',
  review_pending: '?????? ????????????????',
};

function presentPortalValue(value: string | null | undefined, language: Lang, fallback = '???') {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return language === 'ar' ? (arabicPresentationValues[normalized.toLowerCase()] || normalized) : normalized;
}

const reviewStatusDisplay = {
  ar: {
    Draft: 'مسودة',
    Submitted: 'مُرسَل',
    'Needs Changes': 'يحتاج تعديلات',
    Approved: 'معتمد',
    Suspended: 'معلّق',
  },
  en: {
    Draft: 'Draft',
    Submitted: 'Submitted',
    'Needs Changes': 'Needs Changes',
    Approved: 'Approved',
    Suspended: 'Suspended',
  },
} as const;

const labels = {
  ar: {
    titlePartner: 'بوابة الشريك',
    titleProvider: 'بوابة مزود الخدمة',
    subtitlePartner: 'إدارة onboarding والامتثال والخدمات والحجوزات والتسويات ضمن DIR3COM Core',
    subtitleProvider: 'إدارة بيانات المزود، المستندات، الخدمات/المركبات، الأسعار والتوفر، والحجوزات',
    tabProfile: 'الملف',
    tabDocs: 'المستندات',
    tabProducts: 'الخدمات',
    tabBookings: 'الحجوزات',
    tabSettlements: 'المستحقات',
    tabCompliance: 'الامتثال',
    save: 'حفظ الملف',
    saveContinue: 'حفظ ومتابعة',
    saveFailed: 'تعذر حفظ الخدمة. لم يتم الانتقال.',
    upload: 'رفع',
    addService: 'إضافة خدمة',
    uploadImage: 'رفع صورة',
    reload: 'تحديث',
    legalName: 'الاسم القانوني',
    contactPerson: 'اسم المسؤول',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    country: 'الدولة',
    city: 'المدينة',
    commercialReg: 'السجل التجاري',
    taxNumber: 'الرقم الضريبي',
    iban: 'IBAN',
    reviewStatus: 'حالة المراجعة',
    docType: 'نوع المستند',
    serviceNameAr: 'اسم الخدمة (عربي)',
    serviceNameEn: 'اسم الخدمة (English)',
    price: 'السعر',
    currency: 'العملة',
    status: 'الحالة',
    done: 'تم التنفيذ بنجاح',
    failed: 'تعذر تنفيذ العملية',
    missing: 'مستندات ناقصة',
    expired: 'مستندات منتهية',
    pending: 'طلبات قيد المراجعة',
    imageReady: 'الصورة جاهزة للرفع',
    uploading: 'جارٍ رفع الصورة...',
    savedImage: 'تم حفظ الصورة',
    deletedImage: 'تم حذف الصورة',
    currentImages: 'صور المنتج الحالية',
    openImage: 'فتح الصورة',
    replaceImage: 'استبدال الصورة',
    deleteImage: 'حذف الصورة',
    confirmDelete: 'هل تريد حذف هذه الصورة؟',
  },
  en: {
    titlePartner: 'Partner Portal',
    titleProvider: 'Service Provider Portal',
    subtitlePartner: 'Manage onboarding, compliance, services, bookings, and settlements on DIR3COM Core',
    subtitleProvider: 'Manage provider profile, documents, services/assets, pricing, availability, and bookings',
    tabProfile: 'Profile',
    tabDocs: 'Documents',
    tabProducts: 'Services',
    tabBookings: 'Bookings',
    tabSettlements: 'Settlements',
    tabCompliance: 'Compliance',
    save: 'Save Profile',
    saveContinue: 'Save & Continue',
    saveFailed: 'The service could not be saved. You have not been moved to the next step.',
    upload: 'Upload',
    addService: 'Add Service',
    uploadImage: 'Upload Image',
    reload: 'Refresh',
    legalName: 'Legal Name',
    contactPerson: 'Contact Person',
    email: 'Email',
    phone: 'Phone',
    country: 'Country',
    city: 'City',
    commercialReg: 'Commercial Registration',
    taxNumber: 'Tax Number',
    iban: 'IBAN',
    reviewStatus: 'Review Status',
    docType: 'Document Type',
    serviceNameAr: 'Service Name (Arabic)',
    serviceNameEn: 'Service Name (English)',
    price: 'Price',
    currency: 'Currency',
    status: 'Status',
    done: 'Operation completed',
    failed: 'Operation failed',
    missing: 'Missing Documents',
    expired: 'Expired Documents',
    pending: 'Pending Reviews',
    imageReady: 'Image ready to upload',
    uploading: 'Uploading image...',
    savedImage: 'Image saved',
    deletedImage: 'Image deleted',
    currentImages: 'Current product images',
    openImage: 'Open image',
    replaceImage: 'Replace image',
    deleteImage: 'Delete image',
    confirmDelete: 'Delete this image?',
  },
} as const;

function formatDate(value?: string | null, lang: Lang = 'ar') {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US').format(date);
}

function buildProductDrafts(rows: ProductAvailabilityRow[]) {
  const next: Record<string, EditableProduct> = {};
  for (const row of rows) {
    const productId = row.products?.id;
    if (!productId) continue;
    next[productId] = {
      productId,
      nameAr: row.products?.name_ar || '',
      nameEn: row.products?.name_en || '',
      city: row.products?.city || row.city || '',
      basePrice: String(row.products?.base_price ?? 0),
      currency: row.products?.currency || 'SAR',
      status: row.products?.status || 'draft',
    };
  }
  return next;
}

export default function PartnerProviderPortalClient({ mode }: { mode: PortalMode }) {
  const { language, direction, toggleLanguage } = useLanguage();
  const [tab, setTab] = useState<'profile' | 'docs' | 'products' | 'bookings' | 'settlements' | 'compliance'>('profile');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const [profile, setProfile] = useState<ProfileData>({});
  const [documents, setDocuments] = useState<PartnerDocument[]>([]);
  const [products, setProducts] = useState<ProductAvailabilityRow[]>([]);
  const [productDrafts, setProductDrafts] = useState<Record<string, EditableProduct>>({});
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docType, setDocType] = useState('commercial_registration');
  const [newProduct, setNewProduct] = useState({
    nameAr: '',
    nameEn: '',
    city: '',
    basePrice: '0',
    currency: 'SAR',
    status: 'draft',
  });
  const [productImage, setProductImage] = useState<{ productId: string; file: File | null; previewUrl: string }>({ productId: '', file: null, previewUrl: '' });
  const [replacementImages, setReplacementImages] = useState<Record<string, { file: File; previewUrl: string }>>({});

  const t = labels[language as Lang];

  useEffect(() => () => {
    if (productImage.previewUrl) URL.revokeObjectURL(productImage.previewUrl);
  }, [productImage.previewUrl]);

  const pageTitle = useMemo(() => (mode === 'partner' ? t.titlePartner : t.titleProvider), [mode, t]);
  const pageSubtitle = useMemo(() => (mode === 'partner' ? t.subtitlePartner : t.subtitleProvider), [mode, t]);

  const loadAll = useCallback(async () => {
    setBusy(true);
    setMessage('');
    try {
      const [profileRes, docsRes, productsRes, bookingsRes, settlementsRes, complianceRes] = await Promise.all([
        fetch('/api/partner-portal/profile', { cache: 'no-store' }),
        fetch('/api/partner-portal/documents', { cache: 'no-store' }),
        fetch('/api/partner-portal/products', { cache: 'no-store' }),
        fetch('/api/partner-portal/bookings', { cache: 'no-store' }),
        fetch('/api/partner-portal/settlements', { cache: 'no-store' }),
        fetch('/api/partner-portal/compliance', { cache: 'no-store' }),
      ]);

      const profileJson = await profileRes.json().catch(() => ({}));
      const docsJson = await docsRes.json().catch(() => ({}));
      const productsJson = await productsRes.json().catch(() => ({}));
      const bookingsJson = await bookingsRes.json().catch(() => ({}));
      const settlementsJson = await settlementsRes.json().catch(() => ({}));
      const complianceJson = await complianceRes.json().catch(() => ({}));

      setProfile((profileJson?.data?.partner || {}) as ProfileData);
      setDocuments(Array.isArray(docsJson?.data) ? (docsJson.data as PartnerDocument[]) : []);
      const productRows = Array.isArray(productsJson?.data) ? (productsJson.data as ProductAvailabilityRow[]) : [];
      setProducts(productRows);
      setProductDrafts(buildProductDrafts(productRows));
      setBookings(Array.isArray(bookingsJson?.data) ? (bookingsJson.data as BookingRow[]) : []);
      setSettlements(Array.isArray(settlementsJson?.data) ? (settlementsJson.data as SettlementRow[]) : []);
      setCompliance((complianceJson?.data || null) as ComplianceData | null);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }, [t.failed]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void loadAll();
    }, 0);

    return () => clearTimeout(handle);
  }, [loadAll]);

  async function saveProfile() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/partner-portal/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legalName: profile.company_name,
          contactPerson: profile.contact_person,
          email: profile.email,
          phone: profile.phone,
          country: profile.country,
          city: profile.city,
          commercialRegistration: profile.commercial_registration,
          taxNumber: profile.tax_number,
          iban: profile.iban,
          reviewStatus: profile.reviewStatus,
        }),
      });

      if (!response.ok) {
        throw new Error('SAVE_FAILED');
      }

      const payload = await response.json();
      setProfile(payload?.data || profile);
      setMessage(t.done);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function uploadDocument(replaceDocumentId?: string) {
    if (!selectedFile) return;

    const validation = await validateAndNormalizeDocumentFile(selectedFile);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', docType);
      if (replaceDocumentId) formData.append('replaceDocumentId', replaceDocumentId);

      const response = await fetch('/api/partner-portal/documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('UPLOAD_FAILED');
      }

      const payload = await response.json();
      setDocuments((prev) => replaceDocumentId
        ? prev.map((document) => document.id === replaceDocumentId ? payload.data as PartnerDocument : document)
        : [payload.data as PartnerDocument, ...prev]);
      setSelectedFile(null);
      setMessage(t.done);
      void loadAll();
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocument(documentId: string) {
    if (!window.confirm(language === 'ar' ? 'حذف هذا المستند؟' : 'Delete this document?')) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/partner-portal/documents?documentId=${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('DELETE_FAILED');
      setDocuments((prev) => prev.filter((document) => document.id !== documentId));
      setMessage(t.done);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function createProduct() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/partner-portal/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProduct),
      });

      if (!response.ok) {
        throw new Error('CREATE_PRODUCT_FAILED');
      }

      setNewProduct({ nameAr: '', nameEn: '', city: '', basePrice: '0', currency: 'SAR', status: 'draft' });
      setMessage(t.done);
      void loadAll();
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function uploadProductImage() {
    if (!productImage.file || !productImage.productId) return;

    const validation = await validateAndNormalizeDocumentFile(productImage.file);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('productId', productImage.productId);
      formData.append('file', productImage.file);

      const response = await fetch('/api/partner-portal/products/images', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('UPLOAD_IMAGE_FAILED');
      }

      await loadAll();
      setProductImage({ productId: '', file: null, previewUrl: '' });
      setMessage(t.savedImage);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function replaceProductImage(productId: string, imageId: string) {
    const replacement = replacementImages[imageId];
    if (!replacement) return;

    const validation = await validateAndNormalizeDocumentFile(replacement.file);
    if (!validation.ok) {
      setMessage(validation.message);
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('productId', productId);
      formData.append('replaceImageId', imageId);
      formData.append('file', replacement.file);
      const response = await fetch('/api/partner-portal/products/images', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('REPLACE_IMAGE_FAILED');
      await loadAll();
      URL.revokeObjectURL(replacement.previewUrl);
      setReplacementImages((current) => {
        const next = { ...current };
        delete next[imageId];
        return next;
      });
      setMessage(t.savedImage);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProductImage(imageId: string) {
    if (!window.confirm(t.confirmDelete)) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/partner-portal/products/images?imageId=${encodeURIComponent(imageId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('DELETE_IMAGE_FAILED');
      await loadAll();
      setMessage(t.deletedImage);
    } catch {
      setMessage(t.failed);
    } finally {
      setBusy(false);
    }
  }

  function updateProductDraft(productId: string, field: keyof EditableProduct, value: string) {
    setProductDrafts((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      return {
        ...prev,
        [productId]: {
          ...current,
          [field]: value,
        },
      };
    });
  }

  async function saveExistingProduct(productId: string) {
    const draft = productDrafts[productId];
    if (!draft) return;

    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/partner-portal/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: draft.productId,
          nameAr: draft.nameAr,
          nameEn: draft.nameEn,
          city: draft.city,
          basePrice: draft.basePrice,
          currency: draft.currency,
          status: draft.status,
        }),
      });

      if (!response.ok) {
        throw new Error('UPDATE_PRODUCT_FAILED');
      }

      const payload = await response.json().catch(() => null);
      if (payload?.data?.product?.id !== productId) {
        throw new Error('UPDATE_PRODUCT_RESPONSE_INVALID');
      }

      await loadAll();
      setMessage(t.done);
      setTab('bookings');
    } catch {
      setMessage(t.saveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full px-3 py-6 text-[#334155] sm:px-4 sm:py-8" dir={direction}>
      <div className="portal-shell-center w-full max-w-7xl rounded-[2rem] border border-[#D4AF37]/25 bg-[#FAF8F4] p-4 shadow-[0_24px_60px_rgba(13,27,42,0.35)] sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:gap-5">
          <div>
            <h1 className="text-3xl font-semibold text-[#334155]">{pageTitle}</h1>
            <p className="mt-2 text-sm text-[#64748B]">{pageSubtitle}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={toggleLanguage}
              className="min-h-11 rounded-xl border border-[#334155]/20 px-4 py-2 text-sm text-[#334155]"
            >
              {language === 'ar' ? 'EN' : 'AR'}
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="min-h-11 rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155]"
            >
              {t.reload}
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['profile', t.tabProfile],
            ['docs', t.tabDocs],
            ['products', t.tabProducts],
            ['bookings', t.tabBookings],
            ['settlements', t.tabSettlements],
            ['compliance', t.tabCompliance],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id as typeof tab)}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm ${
                tab === id ? 'border-[#D4AF37] bg-[#D4AF37]/15 text-[#334155]' : 'border-[color:var(--color-border)] bg-[var(--color-surface)] text-[#334155]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {message ? (
          <div className="mb-4 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-4 py-3 text-sm text-[#334155]">{message}</div>
        ) : null}

        {tab === 'profile' ? (
          <section className="grid gap-4 sm:grid-cols-2">
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.legalName} value={profile.company_name || ''} onChange={(e) => setProfile((prev) => ({ ...prev, company_name: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.contactPerson} value={profile.contact_person || ''} onChange={(e) => setProfile((prev) => ({ ...prev, contact_person: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.email} value={profile.email || ''} onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.phone} value={profile.phone || ''} onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.country} value={profile.country || ''} onChange={(e) => setProfile((prev) => ({ ...prev, country: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.city} value={profile.city || ''} onChange={(e) => setProfile((prev) => ({ ...prev, city: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.commercialReg} value={profile.commercial_registration || ''} onChange={(e) => setProfile((prev) => ({ ...prev, commercial_registration: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.taxNumber} value={profile.tax_number || ''} onChange={(e) => setProfile((prev) => ({ ...prev, tax_number: e.target.value }))} />
            <input className="rounded-xl bg-white px-4 py-3" placeholder={t.iban} value={profile.iban || ''} onChange={(e) => setProfile((prev) => ({ ...prev, iban: e.target.value }))} />
            <select className="rounded-xl bg-white px-4 py-3" value={profile.reviewStatus || 'Draft'} onChange={(e) => setProfile((prev) => ({ ...prev, reviewStatus: e.target.value }))}>
              {reviewStatusOptions.map((value) => (
                <option key={value} value={value}>{reviewStatusDisplay[language as Lang][value as keyof (typeof reviewStatusDisplay)['en']]}</option>
              ))}
            </select>
            <div className="sm:col-span-2">
              <button type="button" disabled={busy} onClick={() => void saveProfile()} className="rounded-xl bg-[#D4AF37] px-5 py-2.5 text-sm font-semibold text-[#334155] disabled:opacity-60">
                {t.save}
              </button>
            </div>
          </section>
        ) : null}

        {tab === 'docs' ? (
          <section>
            <div className="mb-4 flex flex-wrap items-stretch gap-2 sm:items-center">
              <select className="min-h-11 w-full rounded-xl bg-white px-4 py-3 text-sm sm:w-auto" value={docType} onChange={(e) => setDocType(e.target.value)}>
                <option value="commercial_registration">{presentPortalValue('commercial_registration', language as Lang)}</option>
                <option value="tax_card">tax_card</option>
                <option value="manager_id">manager_id</option>
                <option value="authorization_letter">authorization_letter</option>
                <option value="bank_letter">bank_letter</option>
                <option value="license">license</option>
                <option value="insurance">insurance</option>
                <option value="vehicle_registration">vehicle_registration</option>
              </select>
              <input type="file" accept={uploadAccept} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="min-h-11 w-full rounded-xl bg-white px-4 py-3 text-sm sm:w-auto sm:max-w-xs" />
              <button type="button" disabled={busy || !selectedFile} onClick={() => void uploadDocument()} className="min-h-11 w-full rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155] disabled:opacity-60 sm:w-auto">
                {t.upload}
              </button>
            </div>
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm [overflow-wrap:anywhere]">
                  <span className="font-semibold text-[#334155]">{presentPortalValue(doc.document_type, language as Lang)}</span>
                  <span className="mx-2 text-[#64748B]">|</span>
                  <span>{presentPortalValue(doc.status, language as Lang, presentPortalValue('pending', language as Lang))}</span>
                  <span className="mx-2 text-[#64748B]">|</span>
                  <span>{doc.verified ? (language === 'ar' ? '????????' : 'verified') : presentPortalValue('unverified', language as Lang)}</span>
                  <span className="mx-2 text-[#64748B]">|</span>
                  <span>{formatDate(doc.created_at || undefined, language as Lang)}</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`/api/partner-portal/documents?documentId=${encodeURIComponent(doc.id)}`} target="_blank" rel="noreferrer" className="rounded-lg border border-[#334155]/20 px-2 py-1">{language === 'ar' ? 'عرض' : 'Preview'}</a>
                    <button type="button" disabled={busy || !selectedFile} onClick={() => void uploadDocument(doc.id)} className="rounded-lg border border-[#334155]/20 px-2 py-1 disabled:opacity-50">{language === 'ar' ? 'استبدال' : 'Replace'}</button>
                    <button type="button" disabled={busy} onClick={() => void deleteDocument(doc.id)} className="rounded-lg border border-red-300 px-2 py-1 text-red-700 disabled:opacity-50">{language === 'ar' ? 'حذف' : 'Delete'}</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {tab === 'products' ? (
          <section>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <input className="rounded-xl bg-white px-4 py-3" placeholder={t.serviceNameAr} value={newProduct.nameAr} onChange={(e) => setNewProduct((prev) => ({ ...prev, nameAr: e.target.value }))} />
              <input className="rounded-xl bg-white px-4 py-3" placeholder={t.serviceNameEn} value={newProduct.nameEn} onChange={(e) => setNewProduct((prev) => ({ ...prev, nameEn: e.target.value }))} />
              <input className="rounded-xl bg-white px-4 py-3" placeholder={t.city} value={newProduct.city} onChange={(e) => setNewProduct((prev) => ({ ...prev, city: e.target.value }))} />
              <input className="rounded-xl bg-white px-4 py-3" placeholder={t.price} value={newProduct.basePrice} onChange={(e) => setNewProduct((prev) => ({ ...prev, basePrice: e.target.value }))} />
              <input className="rounded-xl bg-white px-4 py-3" placeholder={t.currency} value={newProduct.currency} onChange={(e) => setNewProduct((prev) => ({ ...prev, currency: e.target.value }))} />
              <input className="rounded-xl bg-white px-4 py-3" placeholder={t.status} value={newProduct.status} onChange={(e) => setNewProduct((prev) => ({ ...prev, status: e.target.value }))} />
              <div className="sm:col-span-2">
                <button type="button" disabled={busy} onClick={() => void createProduct()} className="rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155] disabled:opacity-60">{t.addService}</button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-stretch gap-2 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-3 sm:items-center">
              <select className="min-h-11 w-full rounded-xl bg-white px-4 py-2 text-sm sm:w-auto" value={productImage.productId} onChange={(e) => setProductImage((prev) => ({ ...prev, productId: e.target.value }))}>
                <option value="">Select product</option>
                {products.map((row) => (
                  <option key={row.id} value={row.products?.id || ''}>{row.products?.name_ar || row.products?.name_en || row.products?.id}</option>
                ))}
              </select>
              <input type="file" accept={uploadAccept} aria-label={t.uploadImage} onChange={(e) => { const file = e.target.files?.[0] || null; setProductImage((prev) => ({ ...prev, file, previewUrl: file ? URL.createObjectURL(file) : '' })); }} className="min-h-11 w-full rounded-xl bg-white px-4 py-2 text-sm sm:w-auto sm:max-w-xs" />
              {productImage.file ? <div className="flex items-center gap-3 rounded-xl border border-[#334155]/15 bg-white px-3 py-2 text-xs text-[#334155]">
                {productImage.previewUrl ? <img src={productImage.previewUrl} alt={productImage.file.name} className="h-12 w-12 rounded-lg object-cover" /> : null}
                <span>{productImage.file.name}<br /><span className="text-[#64748B]">{busy ? t.uploading : t.imageReady}</span></span>
              </div> : null}
              <button type="button" disabled={busy || !productImage.productId || !productImage.file} onClick={() => void uploadProductImage()} className="min-h-11 w-full rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155] disabled:opacity-60 sm:w-auto">{busy ? t.uploading : t.uploadImage}</button>
            </div>

            <div className="space-y-2">
              {products.map((row) => (
                <div key={row.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm [overflow-wrap:anywhere]">
                  {row.products?.id ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="rounded-xl bg-white px-4 py-2"
                        placeholder={t.serviceNameAr}
                        value={productDrafts[row.products.id]?.nameAr || ''}
                        onChange={(e) => updateProductDraft(row.products!.id, 'nameAr', e.target.value)}
                      />
                      <input
                        className="rounded-xl bg-white px-4 py-2"
                        placeholder={t.serviceNameEn}
                        value={productDrafts[row.products.id]?.nameEn || ''}
                        onChange={(e) => updateProductDraft(row.products!.id, 'nameEn', e.target.value)}
                      />
                      <input
                        className="rounded-xl bg-white px-4 py-2"
                        placeholder={t.city}
                        value={productDrafts[row.products.id]?.city || ''}
                        onChange={(e) => updateProductDraft(row.products!.id, 'city', e.target.value)}
                      />
                      <input
                        className="rounded-xl bg-white px-4 py-2"
                        placeholder={t.price}
                        value={productDrafts[row.products.id]?.basePrice || '0'}
                        onChange={(e) => updateProductDraft(row.products!.id, 'basePrice', e.target.value)}
                      />
                      <input
                        className="rounded-xl bg-white px-4 py-2"
                        placeholder={t.currency}
                        value={productDrafts[row.products.id]?.currency || 'SAR'}
                        onChange={(e) => updateProductDraft(row.products!.id, 'currency', e.target.value)}
                      />
                      <input
                        className="rounded-xl bg-white px-4 py-2"
                        placeholder={t.status}
                        value={productDrafts[row.products.id]?.status || 'draft'}
                        onChange={(e) => updateProductDraft(row.products!.id, 'status', e.target.value)}
                      />
                      <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs text-[#64748B]">ID: {row.products.id}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void saveExistingProduct(row.products!.id)}
                          className="rounded-xl bg-[#D4AF37] px-4 py-2 text-sm font-semibold text-[#334155] disabled:opacity-60"
                        >
                          {t.saveContinue}
                        </button>
                      </div>
                      {Array.isArray(row.products.product_images) && row.products.product_images.length > 0 ? <div className="sm:col-span-2 rounded-xl border border-[#334155]/15 bg-white p-3">
                        <p className="mb-2 text-sm font-semibold text-[#334155]">{t.currentImages}</p>
                        <div className="flex flex-wrap gap-3">
                          {row.products.product_images.map((image) => <div key={image.id} className="flex flex-wrap items-end gap-2 rounded-lg border border-[#334155]/10 p-2 text-xs text-[#334155]">
                            <a href={`/api/partner-portal/products/images?imageId=${encodeURIComponent(image.id)}`} target="_blank" rel="noreferrer" className="group inline-flex flex-col gap-1" aria-label={`${t.openImage}: ${row.products?.name_en || row.products?.name_ar || ''}`}>
                              <img src={`/api/partner-portal/products/images?imageId=${encodeURIComponent(image.id)}`} alt={image.caption || t.currentImages} className="h-20 w-20 rounded-lg border border-[#334155]/15 object-cover transition group-hover:border-[#D4AF37]" />
                              <span>{t.openImage}</span>
                            </a>
                            <label className="inline-flex cursor-pointer flex-col gap-1">
                              <span>{t.replaceImage}</span>
                              <input type="file" accept={uploadAccept} className="max-w-32 text-[10px]" onChange={(event) => { const file = event.target.files?.[0]; if (file) setReplacementImages((current) => ({ ...current, [image.id]: { file, previewUrl: URL.createObjectURL(file) } })); }} />
                            </label>
                            {replacementImages[image.id] ? <>
                              <img src={replacementImages[image.id].previewUrl} alt={replacementImages[image.id].file.name} className="h-12 w-12 rounded object-cover" />
                              <button type="button" disabled={busy} onClick={() => void replaceProductImage(row.products!.id, image.id)} className="rounded-lg bg-[#D4AF37] px-2 py-1 text-[10px] font-semibold text-[#334155] disabled:opacity-60">{busy ? t.uploading : t.replaceImage}</button>
                            </> : null}
                            <button type="button" disabled={busy} onClick={() => void deleteProductImage(image.id)} className="rounded-lg border border-red-700/30 px-2 py-1 text-[10px] text-red-700 disabled:opacity-60">{t.deleteImage}</button>
                          </div>)}
                        </div>
                      </div> : null}
                    </div>
                  ) : (
                    <span className="text-[#64748B]">Unknown product</span>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-6">
              <OnboardingAssetsPanel mode={mode} language={language as Lang} direction={direction} />
            </div>
          </section>
        ) : null}

        {tab === 'bookings' ? (
          <section className="space-y-2">
            {bookings.map((booking) => (
              <div key={booking.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm [overflow-wrap:anywhere]">
                <span className="font-semibold text-[#334155]">{booking.booking_reference || booking.id}</span>
                <span className="mx-2 text-[#64748B]">|</span>
                <span>{presentPortalValue(booking.status, language as Lang, presentPortalValue('pending', language as Lang))}</span>
                <span className="mx-2 text-[#64748B]">|</span>
                <span>{booking.total_amount ?? booking.total_price ?? 0} {booking.currency || 'SAR'}</span>
                <span className="mx-2 text-[#64748B]">|</span>
                <span>{booking.product_name || '—'}</span>
              </div>
            ))}
          </section>
        ) : null}

        {tab === 'settlements' ? (
          <section className="space-y-2">
            {settlements.map((settlement) => (
              <div key={settlement.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm [overflow-wrap:anywhere]">
                <span className="font-semibold text-[#334155]">{settlement.amount} {settlement.currency || 'SAR'}</span>
                  <span className="mx-2 text-[#64748B]">|</span>
                <span>{presentPortalValue(settlement.settlement_status, language as Lang, presentPortalValue('pending', language as Lang))}</span>
                <span className="mx-2 text-[#9EB0C3]">|</span>
                  <span>{formatDate(settlement.release_date || settlement.created_at || undefined, language as Lang)}</span>
              </div>
            ))}
          </section>
        ) : null}

        {tab === 'compliance' ? (
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs text-[#64748B]">{t.missing}</p>
              <p className="mt-2 text-sm text-[#334155]">{(compliance?.missingDocuments || []).join(', ') || '—'}</p>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs text-[#64748B]">{t.expired}</p>
              <p className="mt-2 text-sm text-[#334155]">
                {(compliance?.expiredDocuments || []).map((doc) => `${doc.documentType} (${formatDate(doc.expiryDate, language as Lang)})`).join(', ') || '—'}
              </p>
            </div>
            <div className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-4">
                <p className="text-xs text-[#64748B]">{t.pending}</p>
              <p className="mt-2 text-lg font-semibold text-[#334155]">{compliance?.pendingReviews ?? 0}</p>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
