'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Mode = 'partner' | 'provider';
type Lang = 'ar' | 'en';

type OwnerKind = 'drive_partner' | 'stay_supplier';

type ProductWorkflowStatus =
  | 'draft'
  | 'needs_confirmation'
  | 'submitted'
  | 'validation_failed'
  | 'pending_review'
  | 'approved'
  | 'published';

type MediaWorkflowStatus =
  | 'provisional_seed'
  | 'pending_validation'
  | 'needs_supplier_action'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'archived';

type Asset = {
  id: string;
  ownerKind: OwnerKind;
  ownerLabel: string;
  assetType: 'vehicle' | 'apartment_unit';
  title: string;
  location: string;
  make: string;
  model: string;
  vehicleCategory: string;
  plateNumber: string;
  capacity: string;
  amenities: string[];
  pricing: string;
  availability: string;
  cancellationPolicy: string;
  accessRules: string;
  optionalVideoUrl: string;
  futureVideoUploadEnabled: boolean;
  verificationStatus: string;
  dataStatus: ProductWorkflowStatus;
  visualConfidence: 'verified' | 'needs_supplier_confirmation';
  needsConfirmationFields: string[];
  submittedAt: string;
  updatedAt: string;
};

type Media = {
  id: string;
  assetId: string;
  ownerKind: OwnerKind;
  label: string;
  url: string;
  origin: string;
  mimeType: string;
  sizeBytes: number;
  sortOrder: number;
  status: MediaWorkflowStatus;
  technicalValidation: {
    messages: string[];
  };
};

type ContractAssociation = {
  id: string;
  ownerKind: OwnerKind;
  ownerLabel: string;
  contractRef: string;
  contractStatus: string;
  notes: string;
};

type ReviewQueueItem = {
  id: string;
  ownerKind: OwnerKind;
  assetId: string;
  mediaId: string;
  oldImageUrl: string;
  newImageUrl: string;
  partnerOrSupplier: string;
  technicalValidationStatus: 'pass' | 'fail';
  technicalSummary: string[];
  changedFields: string[];
  submittedAt: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'needs_supplier_action';
};

const labels = {
  ar: {
    heading: 'أصولك الحالية',
    subheading: 'صور WhatsApp وScreenshots معتمدة كبذور أولية حتى يتم الاستبدال والتحسين',
    contracts: 'ارتباطات مسودات العقود',
    media: 'معرض الوسائط',
    upload: 'رفع/استبدال صورة',
    replaceHint: 'استبدال (اختياري)',
    save: 'حفظ',
    submit: 'إرسال للمراجعة',
    reorderUp: 'لأعلى',
    reorderDown: 'لأسفل',
    pending: 'قيد المراجعة',
    approved: 'معتمد',
    live: 'Live',
    needsConfirmation: 'Needs your confirmation',
    needsBetterPhoto: 'Needs better photo',
    reviewQueue: 'طابور المراجعة الداخلي',
    approve: 'APPROVE',
    reject: 'REJECT',
    requestReplacement: 'REQUEST REPLACEMENT',
    noAssets: 'لا توجد أصول بعد',
    done: 'تم الحفظ',
    failed: 'تعذر تنفيذ العملية',
    title: 'العنوان',
    location: 'الموقع',
    make: 'الماركة',
    model: 'الموديل',
    plate: 'اللوحة',
    pricing: 'التسعير',
    availability: 'التوفر',
    amenities: 'المزايا (comma separated)',
    videoUrl: 'رابط فيديو اختياري',
  },
  en: {
    heading: 'Current Assets',
    subheading: 'WhatsApp photos and screenshots are accepted as provisional seed until replacement and review',
    contracts: 'Contract Draft Associations',
    media: 'Media Gallery',
    upload: 'Upload/Replace Image',
    replaceHint: 'Replace (optional)',
    save: 'Save',
    submit: 'Submit For Review',
    reorderUp: 'Up',
    reorderDown: 'Down',
    pending: 'Pending review',
    approved: 'Approved',
    live: 'Live',
    needsConfirmation: 'Needs your confirmation',
    needsBetterPhoto: 'Needs better photo',
    reviewQueue: 'Internal Review Queue',
    approve: 'APPROVE',
    reject: 'REJECT',
    requestReplacement: 'REQUEST REPLACEMENT',
    noAssets: 'No assets yet',
    done: 'Operation completed',
    failed: 'Operation failed',
    title: 'Title',
    location: 'Location',
    make: 'Make',
    model: 'Model',
    plate: 'Plate',
    pricing: 'Pricing',
    availability: 'Availability',
    amenities: 'Amenities (comma separated)',
    videoUrl: 'Optional video URL',
  },
} as const;

function ownerFromMode(mode: Mode): OwnerKind {
  return mode === 'provider' ? 'stay_supplier' : 'drive_partner';
}

function publicImageUrl(path: string) {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('/')) {
    return path;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  if (!supabaseUrl) return '';
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/partner-media/${path}`;
}

export default function OnboardingAssetsPanel({ mode, language, direction }: { mode: Mode; language: Lang; direction: 'rtl' | 'ltr' }) {
  const t = labels[language];
  const ownerKind = useMemo(() => ownerFromMode(mode), [mode]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [contracts, setContracts] = useState<ContractAssociation[]>([]);
  const [queue, setQueue] = useState<ReviewQueueItem[]>([]);
  const [uploadByAsset, setUploadByAsset] = useState<Record<string, { file: File | null; label: string; replaceMediaId: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [assetsRes, queueRes] = await Promise.all([
        fetch(`/api/partner-portal/assets?ownerKind=${ownerKind}`, { cache: 'no-store' }),
        fetch(`/api/partner-portal/review-queue?ownerKind=${ownerKind}`, { cache: 'no-store' }),
      ]);

      const assetsJson = await assetsRes.json().catch(() => ({}));
      const queueJson = await queueRes.json().catch(() => ({}));

      setAssets(Array.isArray(assetsJson?.data?.assets) ? assetsJson.data.assets : []);
      setMedia(Array.isArray(assetsJson?.data?.media) ? assetsJson.data.media : []);
      setContracts(Array.isArray(assetsJson?.data?.contracts) ? assetsJson.data.contracts : []);
      setQueue(Array.isArray(queueJson?.data) ? queueJson.data : []);
    } catch {
      setMessage(t.failed);
    } finally {
      setLoading(false);
    }
  }, [ownerKind, t.failed]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 0);

    return () => clearTimeout(timer);
  }, [load]);

  const mediaByAsset = useMemo(() => {
    const map: Record<string, Media[]> = {};
    for (const item of media) {
      map[item.assetId] = map[item.assetId] || [];
      map[item.assetId].push(item);
    }

    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.sortOrder - b.sortOrder);
    }

    return map;
  }, [media]);

  function patchAsset(assetId: string, patch: Partial<Asset>) {
    setAssets((prev) => prev.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)));
  }

  async function saveAsset(asset: Asset, submit: boolean) {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/partner-portal/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId: asset.id,
          title: asset.title,
          location: asset.location,
          make: asset.make,
          model: asset.model,
          plateNumber: asset.plateNumber,
          amenities: asset.amenities,
          pricing: asset.pricing,
          availability: asset.availability,
          optionalVideoUrl: asset.optionalVideoUrl,
          needsConfirmationFields: asset.needsConfirmationFields,
          submit,
        }),
      });

      if (!response.ok) {
        throw new Error('SAVE_FAILED');
      }

      setMessage(t.done);
      await load();
    } catch {
      setMessage(t.failed);
    } finally {
      setLoading(false);
    }
  }

  async function uploadMedia(assetId: string) {
    const local = uploadByAsset[assetId];
    if (!local?.file) return;

    setLoading(true);
    setMessage('');
    try {
      const form = new FormData();
      form.append('ownerKind', ownerKind);
      form.append('assetId', assetId);
      form.append('label', local.label || local.file.name);
      if (local.replaceMediaId) {
        form.append('replaceMediaId', local.replaceMediaId);
      }
      form.append('file', local.file);

      const response = await fetch('/api/partner-portal/assets/media', {
        method: 'POST',
        body: form,
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        const firstMessage = String(errorPayload?.data?.technicalValidation?.messages?.[0] || t.failed);
        setMessage(firstMessage);
        return;
      }

      setMessage(t.done);
      setUploadByAsset((prev) => ({ ...prev, [assetId]: { file: null, label: '', replaceMediaId: '' } }));
      await load();
    } catch {
      setMessage(t.failed);
    } finally {
      setLoading(false);
    }
  }

  async function reorderMedia(assetId: string, mediaId: string, directionStep: -1 | 1) {
    const current = mediaByAsset[assetId] || [];
    const index = current.findIndex((item) => item.id === mediaId);
    if (index < 0) return;

    const nextIndex = index + directionStep;
    if (nextIndex < 0 || nextIndex >= current.length) return;

    const ordered = [...current];
    const [moved] = ordered.splice(index, 1);
    ordered.splice(nextIndex, 0, moved);

    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/partner-portal/assets/media', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetId,
          orderedMediaIds: ordered.map((item) => item.id),
        }),
      });

      if (!response.ok) {
        throw new Error('REORDER_FAILED');
      }

      setMessage(t.done);
      await load();
    } catch {
      setMessage(t.failed);
    } finally {
      setLoading(false);
    }
  }

  async function review(queueId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_REPLACEMENT') {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/partner-portal/review-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId, action }),
      });

      if (!response.ok) {
        throw new Error('REVIEW_FAILED');
      }

      setMessage(t.done);
      await load();
    } catch {
      setMessage(t.failed);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[color:var(--color-border)] bg-white p-4" dir={direction}>
      <h3 className="text-lg font-semibold text-[#334155]">{t.heading}</h3>
      <p className="mt-1 text-xs text-[#9EB0C3]">{t.subheading}</p>

      {message ? <div className="mt-3 rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 px-3 py-2 text-xs text-[#334155]">{message}</div> : null}

      <div className="mt-4 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-3">
        <p className="text-xs font-semibold text-[#C9D3DF]">{t.contracts}</p>
        <div className="mt-2 space-y-2 text-xs">
          {contracts.map((contract) => (
            <div key={contract.id} className="rounded-lg border border-[color:var(--color-border)] bg-[#FAF8F4] px-3 py-2">
              <p className="font-semibold text-[#334155]">{contract.ownerLabel}</p>
              <p className="text-[#9EB0C3]">{contract.contractRef}</p>
              <p className="text-[#D4AF37]">{contract.contractStatus}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {assets.length === 0 ? <p className="text-sm text-[#9EB0C3]">{t.noAssets}</p> : null}

        {assets.map((asset) => {
          const assetMedia = mediaByAsset[asset.id] || [];
          const localUpload = uploadByAsset[asset.id] || { file: null, label: '', replaceMediaId: '' };

          return (
            <article key={asset.id} className="rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-[#D4AF37]/20 px-2 py-1 text-[#334155]">{asset.assetType}</span>
                <span className="rounded-full bg-[#243447] px-2 py-1 text-[#DCE6F2]">{asset.dataStatus}</span>
                <span className="rounded-full bg-[#243447] px-2 py-1 text-[#DCE6F2]">{asset.verificationStatus}</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.title} onChange={(e) => patchAsset(asset.id, { title: e.target.value })} placeholder={t.title} />
                <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.location} onChange={(e) => patchAsset(asset.id, { location: e.target.value })} placeholder={t.location} />
                {asset.assetType === 'vehicle' ? (
                  <>
                    <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.make} onChange={(e) => patchAsset(asset.id, { make: e.target.value })} placeholder={t.make} />
                    <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.model} onChange={(e) => patchAsset(asset.id, { model: e.target.value })} placeholder={t.model} />
                    <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.plateNumber} onChange={(e) => patchAsset(asset.id, { plateNumber: e.target.value })} placeholder={t.plate} />
                  </>
                ) : null}
                <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.pricing} onChange={(e) => patchAsset(asset.id, { pricing: e.target.value })} placeholder={t.pricing} />
                <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm" value={asset.availability} onChange={(e) => patchAsset(asset.id, { availability: e.target.value })} placeholder={t.availability} />
                <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm sm:col-span-2" value={asset.amenities.join(', ')} onChange={(e) => patchAsset(asset.id, { amenities: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })} placeholder={t.amenities} />
                <input className="rounded-lg bg-[#FAF8F4] px-3 py-2 text-sm sm:col-span-2" value={asset.optionalVideoUrl} onChange={(e) => patchAsset(asset.id, { optionalVideoUrl: e.target.value })} placeholder={t.videoUrl} />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={loading} onClick={() => void saveAsset(asset, false)} className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-[#334155] disabled:opacity-60">{t.save}</button>
                <button type="button" disabled={loading} onClick={() => void saveAsset(asset, true)} className="rounded-lg bg-[#D4AF37] px-3 py-1.5 text-xs font-semibold text-[#334155] disabled:opacity-60">{t.submit}</button>
              </div>

              <div className="mt-4">
                <p className="text-xs font-semibold text-[#C9D3DF]">{t.media}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {assetMedia.map((item, index) => (
                    <div key={item.id} className="rounded-lg border border-[color:var(--color-border)] bg-[#FAF8F4] p-2">
                      <div className="aspect-[4/3] overflow-hidden rounded bg-black/20">
                        {publicImageUrl(item.url) ? (
                          <img src={publicImageUrl(item.url)} alt={item.label} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-[#9EB0C3]">No preview</div>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] text-[#334155]">{item.label}</p>
                      <p className="text-[10px] text-[#9EB0C3]">{item.status}</p>
                      <div className="mt-2 flex gap-1">
                        <button type="button" disabled={loading || index === 0} onClick={() => void reorderMedia(asset.id, item.id, -1)} className="rounded border border-white/20 px-2 py-1 text-[10px] disabled:opacity-40">{t.reorderUp}</button>
                        <button type="button" disabled={loading || index === assetMedia.length - 1} onClick={() => void reorderMedia(asset.id, item.id, 1)} className="rounded border border-white/20 px-2 py-1 text-[10px] disabled:opacity-40">{t.reorderDown}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-[color:var(--color-border)] bg-[#FAF8F4] p-3">
                <p className="mb-2 text-xs font-semibold text-[#C9D3DF]">{t.upload}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={localUpload.label}
                    onChange={(e) => setUploadByAsset((prev) => ({ ...prev, [asset.id]: { ...localUpload, label: e.target.value } }))}
                    className="rounded-lg bg-white px-3 py-2 text-sm"
                    placeholder="Label"
                  />
                  <select
                    value={localUpload.replaceMediaId}
                    onChange={(e) => setUploadByAsset((prev) => ({ ...prev, [asset.id]: { ...localUpload, replaceMediaId: e.target.value } }))}
                    className="rounded-lg bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{t.replaceHint}</option>
                    {assetMedia.map((item) => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                  <input
                    type="file"
                    onChange={(e) => setUploadByAsset((prev) => ({ ...prev, [asset.id]: { ...localUpload, file: e.target.files?.[0] || null } }))}
                    className="rounded-lg bg-white px-3 py-2 text-sm sm:col-span-2"
                  />
                  <button
                    type="button"
                    disabled={loading || !localUpload.file}
                    onClick={() => void uploadMedia(asset.id)}
                    className="rounded-lg bg-[#D4AF37] px-3 py-2 text-xs font-semibold text-[#334155] disabled:opacity-60"
                  >
                    {t.upload}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-[color:var(--color-border)] bg-[var(--color-surface)] p-4">
        <p className="text-sm font-semibold text-[#334155]">{t.reviewQueue}</p>
        <div className="mt-3 space-y-2">
          {queue.map((item) => (
            <div key={item.id} className="rounded-lg border border-[color:var(--color-border)] bg-[#FAF8F4] p-3 text-xs">
              <p className="font-semibold text-[#334155]">{item.partnerOrSupplier}</p>
              <p className="text-[#9EB0C3]">{item.status}</p>
              <p className="text-[#9EB0C3]">{item.technicalSummary.join(' | ')}</p>
              <p className="text-[#9EB0C3]">Changed: {(item.changedFields || []).join(', ') || '—'}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={loading} onClick={() => void review(item.id, 'APPROVE')} className="rounded border border-green-400/40 px-2 py-1 text-[10px] text-green-200 disabled:opacity-60">{t.approve}</button>
                <button type="button" disabled={loading} onClick={() => void review(item.id, 'REJECT')} className="rounded border border-red-400/40 px-2 py-1 text-[10px] text-red-200 disabled:opacity-60">{t.reject}</button>
                <button type="button" disabled={loading} onClick={() => void review(item.id, 'REQUEST_REPLACEMENT')} className="rounded border border-amber-400/40 px-2 py-1 text-[10px] text-amber-100 disabled:opacity-60">{t.requestReplacement}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
