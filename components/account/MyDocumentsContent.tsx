'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { FiFileText, FiShield, FiPlus, FiDownload, FiEye, FiX, FiGlobe, FiCreditCard, FiTruck } from 'react-icons/fi';
import { useLanguage } from '@/components/i18n/LanguageProvider';
import type { DocumentQueryResult } from '@/lib/customer/document-query';
import { customerHubCopy, formatCustomerHubDate, getVerificationStatusLabel } from '@/lib/i18n/customer-hub';
import { normalizeVerificationStatus } from '@/lib/verification/status';
import { PageHeading, LoadError } from '@/components/v6/Chrome';
import styles from '@/components/v6/v6.module.css';
import { DabraCompact } from '@/components/v6/DabraIdentity';

export type VerificationDocumentRow = {
  id: string; document_type: string; verification_status: string;
  verification_request_id?: string | null; verification_requests?: { status?: string | null } | null;
  issue_date?: string | null; expiry_date: string | null; created_at: string; storage_bucket?: string | null;
};
const categories = [
  ['passport','جوازات السفر','Passports',FiGlobe], ['visa','التأشيرات','Visas',FiFileText],
  ['id_card','بطاقات الهوية','ID cards',FiCreditCard], ['driving_license','رخص القيادة','Driving licenses',FiTruck],
  ['insurance','التأمينات','Insurance',FiShield], ['other','أخرى','Other',FiFileText],
] as const;
export default function MyDocumentsContent({ documentsState }: { documentsState: DocumentQueryResult<VerificationDocumentRow> }) {
  const { language, direction } = useLanguage();
  const ar = language === 'ar', t = customerHubCopy[language].documents;
  const router = useRouter();
  const [category,setCategory] = useState('all'), [search,setSearch] = useState('');
  const [uploading,setUploading] = useState(false), [error,setError] = useState(''), [success,setSuccess] = useState(false);
  const [page,setPage] = useState(1);
  const dialog = useRef<HTMLDialogElement>(null), formRef = useRef<HTMLFormElement>(null), launcher = useRef<HTMLButtonElement>(null);
  const busy = useRef(false), uploadId = useRef<string | null>(null);
  const documents = documentsState.status === 'ready' ? documentsState.documents : [];
  const label = (type: string) => { const item = categories.find(c => c[0] === type); return item ? item[ar ? 1 : 2] : type; };
  const filtered = documents.filter(d => (category === 'all' || d.document_type === category) && (label(d.document_type) + d.id).toLowerCase().includes(search.toLowerCase()));
  const pages = Math.max(1,Math.ceil(filtered.length/10)), current = Math.min(page,pages);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setUploading(true); setError(''); setSuccess(false);
    try {
      const form = new FormData(event.currentTarget), file = form.get('file');
      if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024) { setError(ar ? 'اختر ملفًا صالحًا بحجم لا يتجاوز 4MB.' : 'Choose a valid file up to 4MB.'); return; }
      uploadId.current ??= crypto.randomUUID();
      form.set('uploadId',uploadId.current);
      const result = await fetch('/api/customer/documents',{method:'POST',body:form});
      const payload = await result.json().catch(() => null);
      if (!result.ok || !payload?.data?.id) {
        const code = payload?.error?.code;
        setError(code === 'DOCUMENT_UPLOAD_RETRY' ? (ar ? 'الطلب قيد المعالجة. أعد المحاولة.' : 'Your upload is being processed. Retry shortly.') : ar ? 'لم يُحفظ المستند. تحقق من الملف والبيانات وحاول مرة أخرى.' : 'The document was not saved. Check the file and details, then try again.');
        return;
      }
      formRef.current?.reset(); uploadId.current = null; setSuccess(true);
      dialog.current?.close(); launcher.current?.focus(); router.refresh();
    } catch { setError(ar ? 'تعذّر الاتصال. حاول مرة أخرى.' : 'Could not connect. Please try again.'); }
    finally { busy.current = false; setUploading(false); }
  }
  return <div dir={direction}>
    <div className={styles.documentsHeading} data-dabra-avoid><PageHeading title={ar ? 'مستنداتي' : 'My documents'} subtitle={ar ? 'إدارة وتنظيم مستنداتك المهمة وسهولة الوصول إليها' : 'Organize your important documents and access them easily'} icon={<FiFileText />} /><div className={styles.securityBanner}><DabraCompact artwork="mall-center" /><strong>{ar ? 'مستنداتك الخاصة، في مكان واحد' : 'Your private documents, in one place'}</strong></div></div>
    <div className={styles.categoryGrid}>{categories.map(([key,arabic,english,Icon]) => <button key={key} type="button" aria-pressed={category === key} onClick={() => {setCategory(key);setPage(1);}}><Icon />{ar ? arabic : english}<strong>{documentsState.status === 'ready' ? documents.filter(d => d.document_type === key).length : '—'}</strong></button>)}</div>
    <section className={styles.card}>
      <div className={styles.toolbar}><button type="button" aria-pressed={category === 'all'} onClick={() => {setCategory('all');setPage(1);}} className={styles.secondary}>{ar ? 'الكل' : 'All'}</button><label>{ar ? 'البحث في المستندات' : 'Search documents'}<input type="search" value={search} onChange={e => {setSearch(e.target.value);setPage(1);}} /></label><button ref={launcher} type="button" className={styles.primary} onClick={() => {setError('');setSuccess(false);dialog.current?.showModal();}}><FiPlus />{ar ? 'رفع مستند جديد' : 'Upload New Document'}</button></div>
      {success && <p role="status">{ar ? 'تم حفظ المستند.' : 'Document saved.'}</p>}
      {documentsState.status === 'error' ? <LoadError /> : !filtered.length ? <div className={styles.empty}>{t.empty}</div> : <>
        <div className={styles.tableWrap}><table className={`${styles.table} ${styles.documentTable}`}><thead><tr>{(ar ? ['المستند','تاريخ الإضافة','تاريخ الانتهاء','الحالة','الإجراءات'] : ['Document','Added','Expiry date','Status','Actions']).map(text => <th scope="col" key={text}>{text}</th>)}</tr></thead><tbody>{filtered.slice((current-1)*10,current*10).map(document => <tr key={document.id}>
          <td><FiFileText /> {label(document.document_type)}</td>
          <td data-label={ar ? 'تاريخ الإضافة' : 'Added'}>{formatCustomerHubDate(document.created_at,language)}</td>
          <td data-label={ar ? 'تاريخ الانتهاء' : 'Expiry date'}>{document.expiry_date ? formatCustomerHubDate(document.expiry_date,language) : t.notSpecified}</td>
          <td data-label={ar ? 'الحالة' : 'Status'}><span className={styles.badge}>{getVerificationStatusLabel(normalizeVerificationStatus(document.verification_requests?.status ?? document.verification_status),language)}</span></td>
          <td data-label={ar ? 'الإجراءات' : 'Actions'}>{document.storage_bucket === 'customer-documents' && <div className={styles.documentActions}><a href={'/api/customer/documents?documentId='+document.id} target="_blank" rel="noopener noreferrer" aria-label={ar ? 'عرض المستند' : 'View document'}><FiEye /></a><a href={'/api/customer/documents?documentId='+document.id+'&download=1'} aria-label={ar ? 'تنزيل المستند' : 'Download document'}><FiDownload /></a></div>}</td>
        </tr>)}</tbody></table></div>
        <nav className={styles.toolbar} aria-label={ar ? 'صفحات المستندات' : 'Document pages'}><button className={styles.secondary} type="button" disabled={current===1} onClick={() => setPage(current-1)}>{ar ? 'السابق' : 'Previous'}</button><span>{current} / {pages}</span><button className={styles.secondary} type="button" disabled={current===pages} onClick={() => setPage(current+1)}>{ar ? 'التالي' : 'Next'}</button></nav>
      </>}
    </section>
    <dialog ref={dialog} className={styles.uploadDialog} aria-labelledby="document-upload-title" onCancel={e => {if (busy.current) e.preventDefault();}} onClose={() => launcher.current?.focus()}>
      <button className={styles.closeDialog} type="button" aria-label={ar ? 'إغلاق' : 'Close'} disabled={uploading} onClick={() => dialog.current?.close()}><FiX /></button>
      <h2 id="document-upload-title">{ar ? 'رفع مستند جديد' : 'Upload New Document'}</h2>
      <form ref={formRef} onSubmit={upload} onChange={() => { if (!busy.current) uploadId.current = null; }}>
        <fieldset disabled={uploading}><legend className="sr-only">{ar ? 'بيانات المستند' : 'Document details'}</legend>
        <label className={styles.field}>{ar ? 'نوع المستند' : 'Document type'}<select name="documentType" required>{categories.map(([key,arabic,english]) => <option key={key} value={key}>{ar ? arabic : english}</option>)}</select></label>
        <label className={styles.field}>{ar ? 'الملف' : 'File'}<input name="file" type="file" required accept=".pdf,.jpg,.png,.webp" /><small>PDF · JPG · PNG · WebP · 4MB</small></label>
        <label className={styles.field}>{ar ? 'تاريخ الإصدار (اختياري)' : 'Issue date (optional)'}<input name="issueDate" type="date" /></label>
        <label className={styles.field}>{ar ? 'تاريخ الانتهاء (اختياري)' : 'Expiry date (optional)'}<input name="expiryDate" type="date" /></label>
        </fieldset>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <button className={styles.primary} type="submit" disabled={uploading}>{uploading ? (ar ? 'جارٍ الحفظ…' : 'Saving…') : ar ? 'رفع المستند' : 'Upload document'}</button>
      </form>
    </dialog>
  </div>;
}
