'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { useSupabase } from '@/app/providers';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';

interface Product {
  id: string;
  name_ar: string;
  name_en: string;
  slug: string;
  description_ar?: string;
  description_en?: string;
  price_per_unit: number;
  unit_type: string;
  region_id?: string;
  address_ar?: string;
  address_en?: string;
  latitude?: number;
  longitude?: number;
  is_active: boolean;
  max_guests?: number;
  images?: string[];
  product_type?: string;
  created_at: string;
}

interface BookingFormData {
  city: string;
  arrivalDate: string;
  departureDate: string;
  guests: number;
  specialRequests?: string;
}

interface ClientFormData {
  fullName: string;
  phone: string;
  email: string;
  notes: string;
  passportNumber?: string;
  nationality?: string;
}

interface DocumentFile {
  file: File;
  type: 'passport' | 'visa' | 'other';
  name: string;
}

interface AuthoritativeQuote {
  productId: string;
  productName: string;
  unitPrice: number;
  currency: string;
  bookingDays: number;
  guests: number;
  totalAmount: number;
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div style={{ backgroundColor: '#FAF8F4', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#D4AF37' }}>جاري التحميل...</div>}>
      <BookingContent />
    </Suspense>
  );
}

function BookingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productSlug = searchParams.get('product');
  const { user, isLoading: authLoading } = useSupabase();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bookingRef, setBookingRef] = useState('');
  const [confirmedQuote, setConfirmedQuote] = useState<AuthoritativeQuote | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [authoritativeQuote, setAuthoritativeQuote] = useState<AuthoritativeQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [bookingForm, setBookingForm] = useState<BookingFormData>({
    city: 'الرياض',
    arrivalDate: '',
    departureDate: '',
    guests: 1,
    specialRequests: '',
  });

  const [clientForm, setClientForm] = useState<ClientFormData>({
    fullName: '',
    phone: '',
    email: '',
    notes: '',
    passportNumber: '',
    nationality: 'سعودي',
  });

  const [documents, setDocuments] = useState<DocumentFile[]>([]);

  // ✅ التحقق من تسجيل الدخول
  useEffect(() => {
    if (!productSlug) {
      router.replace('/services');
      return;
    }

    if (!authLoading && !user) {
      const currentUrl = window.location.href;
      const redirectUrl = `/auth/signin?redirect=${encodeURIComponent(currentUrl)}`;
      window.location.href = redirectUrl;
    }
  }, [router, user, authLoading, productSlug]);

  useEffect(() => {
    async function fetchProduct() {
      if (!productSlug) {
        setLoading(false);
        setError('❌ لم يتم تحديد المنتج');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('products')
          .select('*')
          .eq('slug', productSlug)
          .single();

        if (error) throw error;
        setProduct(data);
      } catch (err) {
        console.error('Error fetching product:', err);
        setError('❌ حدث خطأ في تحميل بيانات المنتج');
        setProduct(null);
      } finally {
        setLoading(false);
      }
    }

    fetchProduct();
  }, [productSlug]);

  const handleBookingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    if (name === 'guests') {
      const parsedGuests = Number(value);
      setBookingForm(prev => ({ ...prev, guests: Number.isFinite(parsedGuests) ? parsedGuests : 1 }));
      return;
    }

    setBookingForm(prev => ({ ...prev, [name]: value }));
  };

  const handleClientChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setClientForm(prev => ({ ...prev, [name]: value }));
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: DocumentFile[] = Array.from(files).map(file => ({
      file,
      type: 'other',
      name: file.name,
    }));

    setDocuments(prev => [...prev, ...newFiles]);
    setError(null);
  };

  const removeDocument = (index: number) => {
    setDocuments(prev => prev.filter((_, i) => i !== index));
  };

  const validateDates = (): boolean => {
    if (!bookingForm.arrivalDate || !bookingForm.departureDate) {
      setError('⚠️ الرجاء اختيار تاريخ الوصول والمغادرة');
      return false;
    }

    const arrival = new Date(bookingForm.arrivalDate);
    const departure = new Date(bookingForm.departureDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (arrival < today) {
      setError('⚠️ لا يمكن اختيار تاريخ في الماضي');
      return false;
    }

    if (departure <= arrival) {
      setError('⚠️ تاريخ المغادرة يجب أن يكون بعد تاريخ الوصول');
      return false;
    }

    const daysDiff = Math.ceil((departure.getTime() - arrival.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 1) {
      setError('⚠️ يجب أن تكون المدة يوم واحد على الأقل');
      return false;
    }

    return true;
  };

  const validateClientData = (): boolean => {
    const trimmedName = clientForm.fullName.trim();
    if (!trimmedName) {
      setError('⚠️ الرجاء إدخال الاسم الكامل');
      return false;
    }
    if (trimmedName.length < 3) {
      setError('⚠️ الاسم يجب أن يكون 3 أحرف على الأقل');
      return false;
    }
    if (trimmedName.length > 50) {
      setError('⚠️ الاسم طويل جداً (حد أقصى 50 حرف)');
      return false;
    }

    const cleanedPhone = clientForm.phone.replace(/\s/g, '');
    const phoneRegex = /^(?:\+?966|0)?5\d{8}$/;
    if (!clientForm.phone.trim() || clientForm.phone.trim().length < 9) {
      setError('⚠️ الرجاء إدخال رقم جوال صحيح');
      return false;
    }
    if (!phoneRegex.test(cleanedPhone)) {
      setError('⚠️ رقم الجوال غير صحيح. يجب أن يكون 05xxxxxxxx أو +9665xxxxxxxx');
      return false;
    }

    if (clientForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientForm.email)) {
      setError('⚠️ الرجاء إدخال بريد إلكتروني صحيح');
      return false;
    }

    if (clientForm.passportNumber && (clientForm.passportNumber.length < 6 || clientForm.passportNumber.length > 15)) {
      setError('⚠️ رقم جواز السفر يجب أن يكون بين 6-15 حرف');
      return false;
    }

    return true;
  };

  const nextStep = () => {
    setError(null);

    if (currentStep === 0) {
      const isValid = validateDates();
      if (!isValid) return;
      setCurrentStep(1);
    } else if (currentStep === 1) {
      const isValid = validateClientData();
      if (!isValid) return;
      setQuoteError(null);
      setAuthoritativeQuote(null);
      setCurrentStep(2);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
    setError(null);
  };

  useEffect(() => {
    async function fetchAuthoritativeQuote() {
      if (!product?.id || currentStep !== 2) {
        return;
      }

      if (!bookingForm.arrivalDate || !bookingForm.departureDate || !Number.isInteger(bookingForm.guests) || bookingForm.guests < 1) {
        setAuthoritativeQuote(null);
        return;
      }

      const params = new URLSearchParams({
        action: 'quote',
        product_id: product.id,
        arrival_date: bookingForm.arrivalDate,
        departure_date: bookingForm.departureDate,
        guests: String(bookingForm.guests),
      });

      setQuoteLoading(true);
      setQuoteError(null);

      try {
        const response = await fetch(`/api/bookings?${params.toString()}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
        });

        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.data) {
          const message = data?.error?.message || 'تعذر تحميل التسعير النهائي من الخادم.';
          throw new Error(message);
        }

        setAuthoritativeQuote(data.data as AuthoritativeQuote);
      } catch (quoteFetchError) {
        const message = quoteFetchError instanceof Error ? quoteFetchError.message : 'تعذر تحميل التسعير النهائي من الخادم.';
        setQuoteError(message);
        setAuthoritativeQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }

    fetchAuthoritativeQuote();
  }, [currentStep, product?.id, bookingForm.arrivalDate, bookingForm.departureDate, bookingForm.guests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (!authoritativeQuote) {
        throw new Error('تعذر تأكيد الحجز دون تسعير خادمي معتمد.');
      }

      const bookingData = {
        product_id: product?.id || null,
        guest_name: clientForm.fullName.trim(),
        guest_phone: clientForm.phone.trim(),
        guest_email: clientForm.email?.trim() || null,
        arrival_date: bookingForm.arrivalDate,
        departure_date: bookingForm.departureDate,
        guests: bookingForm.guests || 1,
        notes: clientForm.notes?.trim() || null,
        special_requests: bookingForm.specialRequests?.trim() || null,
        city: bookingForm.city,
        client_passport: clientForm.passportNumber?.trim() || null,
        client_nationality: clientForm.nationality || null,
      };

      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'فشل الحجز');
      }

      if (!data.data) {
        throw new Error('لم يتم استلام بيانات الحجز');
      }

      setBookingRef(data.data.booking_reference);
      setConfirmedQuote((data.data.quote as AuthoritativeQuote) ?? authoritativeQuote);
      setSuccess(true);
      
    } catch (err: unknown) {
      console.error('Booking error:', err);
      const message = err instanceof Error ? err.message : 'حدث خطأ أثناء إتمام الحجز';
      setError(`❌ ${message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // عرض شاشة تحميل أثناء التحقق من الجلسة
  if (authLoading) {
    return (
      <div style={{
        backgroundColor: '#FAF8F4',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#D4AF37'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '3px solid rgba(212,175,55,0.1)',
            borderTop: '3px solid #D4AF37',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 20px'
          }} />
          جاري التحقق من الجلسة...
        </div>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // إذا لم يكن المستخدم مسجلاً، لا تعرض الصفحة
  if (!user) {
    return null;
  }

  if (loading) {
    return (
      <div style={{
        backgroundColor: '#FAF8F4',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#D4AF37',
        fontFamily: 'var(--font-arabic)',
        fontSize: '1.5rem'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '3px solid rgba(212, 175, 55, 0.1)',
          borderTop: '3px solid #D4AF37',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '20px'
        }} />
        جاري تحميل بيانات الحجز...
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!product) {
    return (
      <div style={{
        backgroundColor: '#FAF8F4',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#334155',
        fontFamily: 'var(--font-arabic)',
        padding: '40px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>⚠️</div>
        <h1 style={{ color: '#D4AF37', fontSize: '2.5rem', marginBottom: '10px' }}>
          المنتج غير موجود
        </h1>
        <p style={{ color: '#8A9BB0', marginBottom: '30px' }}>
          عذراً، لم نتمكن من العثور على الخدمة المطلوبة
        </p>
        <Link 
          href="/services" 
          style={{
            color: '#D4AF37',
            padding: '12px 30px',
            border: '1px solid #D4AF37',
            borderRadius: '30px',
            textDecoration: 'none',
            transition: 'all 0.3s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#D4AF37';
            e.currentTarget.style.color = '#334155';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#D4AF37';
          }}
        >
          ← العودة إلى الخدمات
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        backgroundColor: '#FAF8F4',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#334155',
        fontFamily: 'var(--font-arabic)',
        padding: '40px',
        textAlign: 'center'
      }}>
        <div style={{
          background: 'rgba(212, 175, 55, 0.05)',
          border: '2px solid #D4AF37',
          borderRadius: '20px',
          padding: '50px 40px',
          maxWidth: '500px',
          width: '100%',
          animation: 'fadeIn 0.5s ease'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '20px' }}>✅</div>
          <h1 style={{ color: '#D4AF37', fontSize: '2.5rem', marginBottom: '10px' }}>
            تم الحجز بنجاح!
          </h1>
          <p style={{ color: '#8A9BB0', marginTop: '10px', fontSize: '1.1rem' }}>
            رقم الحجز: <strong style={{ color: '#D4AF37', fontSize: '1.3rem' }}>{bookingRef}</strong>
          </p>
          {confirmedQuote && (
            <div style={{
              background: 'rgba(212, 175, 55, 0.1)',
              borderRadius: '12px',
              padding: '12px',
              marginTop: '15px'
            }}>
              <p style={{ color: '#334155', fontSize: '0.95rem', marginBottom: '6px' }}>
                السعر المعتمد: {confirmedQuote.unitPrice} {confirmedQuote.currency} / ليلة
              </p>
              <p style={{ color: '#D4AF37', fontWeight: 'bold' }}>
                الإجمالي المعتمد: {confirmedQuote.totalAmount} {confirmedQuote.currency}
              </p>
            </div>
          )}
          <div style={{
            background: 'rgba(212, 175, 55, 0.1)',
            borderRadius: '12px',
            padding: '15px',
            margin: '20px 0',
            textAlign: 'right'
          }}>
            <p style={{ color: '#334155', fontSize: '0.9rem' }}>
              📧 تم إرسال تأكيد الحجز إلى بريدك الإلكتروني
            </p>
            <p style={{ color: '#8A9BB0', fontSize: '0.85rem' }}>
              سيتم التواصل معك خلال ٢٤ ساعة لتأكيد التفاصيل النهائية
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link 
              href="/"
              style={{
                padding: '12px 30px',
                background: '#D4AF37',
                color: '#334155',
                borderRadius: '30px',
                textDecoration: 'none',
                fontWeight: 'bold',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#c5a030';
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#D4AF37';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              🏠 الرئيسية
            </Link>
            <Link 
              href="/services"
              style={{
                padding: '12px 30px',
                border: '1px solid #D4AF37',
                color: '#D4AF37',
                borderRadius: '30px',
                textDecoration: 'none',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(212, 175, 55, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              📋 خدمات أخرى
            </Link>
          </div>
        </div>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: '#FAF8F4',
      minHeight: '100vh',
      color: '#334155',
      fontFamily: 'var(--font-arabic)',
      direction: 'rtl',
      padding: '40px 20px'
    }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '2.8rem',
            color: '#D4AF37',
            marginBottom: '5px'
          }}>
            📋 إتمام الحجز
          </h1>
          <p style={{ color: '#8A9BB0', fontSize: '1rem' }}>
            {product.name_ar} • {product.price_per_unit} ريال / {product.unit_type === 'day' ? 'يوم' : product.unit_type}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(255, 0, 0, 0.1)',
            border: '1px solid #ff4444',
            borderRadius: '12px',
            padding: '15px',
            marginBottom: '20px',
            color: '#ff6b6b',
            textAlign: 'center'
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px',
          padding: '0 10px',
          position: 'relative'
        }}>
          {['معلومات الرحلة', 'بيانات العميل', 'المستندات'].map((label, index) => (
            <div key={index} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
              flex: 1,
              position: 'relative'
            }}>
              {index < 2 && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  right: 'calc(50% + 20px)',
                  left: 'calc(-50% + 20px)',
                  height: '2px',
                  background: index < currentStep ? '#D4AF37' : '#2A2A3E',
                  transition: 'background 0.3s ease'
                }} />
              )}
              
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: index <= currentStep ? '#D4AF37' : '#2A2A3E',
                color: index <= currentStep ? '#334155' : '#8A9BB0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '0.9rem',
                zIndex: 1,
                transition: 'all 0.3s ease'
              }}>
                {index + 1}
              </div>
              <span style={{
                fontSize: '0.7rem',
                color: index <= currentStep ? '#D4AF37' : '#4A5A6E',
                textAlign: 'center',
                fontWeight: index === currentStep ? 'bold' : 'normal'
              }}>
                {label}
              </span>
            </div>
          ))}
        </div>

        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(212, 175, 55, 0.15)',
          borderRadius: '20px',
          padding: '20px',
          marginBottom: '30px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '15px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {product.images && product.images[0] && (
              <img 
                src={product.images[0]} 
                alt={product.name_ar}
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: '12px',
                  objectFit: 'cover'
                }}
              />
            )}
            <div>
              <h2 style={{ color: '#FFFFFF', fontSize: '1.2rem', marginBottom: '4px' }}>
                {product.name_ar}
              </h2>
              <p style={{ color: '#8A9BB0', fontSize: '0.85rem' }}>
                {product.description_ar?.substring(0, 80)}...
              </p>
              {product.address_ar && (
                <p style={{ color: '#6B7280', fontSize: '0.75rem', marginTop: '4px' }}>
                  📍 {product.address_ar}
                </p>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'left' }}>
            <p style={{ color: '#D4AF37', fontSize: '1.1rem', fontWeight: 'bold' }}>
              {product.price_per_unit} ريال / {product.unit_type === 'day' ? 'يوم' : product.unit_type}
            </p>
            {authoritativeQuote && bookingForm.arrivalDate && bookingForm.departureDate && (
              <p style={{ color: '#8A9BB0', fontSize: '0.8rem' }}>
                الإجمالي المعتمد: {authoritativeQuote.totalAmount} {authoritativeQuote.currency}
              </p>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          {currentStep === 0 && (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid rgba(212, 175, 55, 0.15)',
              borderRadius: '20px',
              padding: '30px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    color: '#8A9BB0', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    المدينة <span style={{ color: '#D4AF37' }}>*</span>
                  </label>
                  <select
                    name="city"
                    value={bookingForm.city}
                    onChange={handleBookingChange}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  >
                    <option value="الرياض">الرياض</option>
                    <option value="جدة">جدة</option>
                    <option value="مكة">مكة</option>
                    <option value="المدينة">المدينة</option>
                    <option value="الدمام">الدمام</option>
                    <option value="الخبر">الخبر</option>
                    <option value="القاهرة">القاهرة</option>
                    <option value="الإسكندرية">الإسكندرية</option>
                    <option value="شرم الشيخ">شرم الشيخ</option>
                    <option value="الغردقة">الغردقة</option>
                    <option value="الساحل الشمالي">الساحل الشمالي</option>
                    <option value="الأقصر">الأقصر</option>
                    <option value="أسوان">أسوان</option>
                  </select>
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    color: '#8A9BB0', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    عدد الضيوف <span style={{ color: '#D4AF37' }}>*</span>
                  </label>
                  <input
                    type="number"
                    name="guests"
                    value={bookingForm.guests}
                    onChange={handleBookingChange}
                    min={1}
                    max={product.max_guests || 20}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                  {product.max_guests && (
                    <p style={{ color: '#4A5A6E', fontSize: '0.75rem', marginTop: '5px' }}>
                      الحد الأقصى: {product.max_guests} ضيف
                    </p>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    color: '#8A9BB0', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    تاريخ الوصول <span style={{ color: '#D4AF37' }}>*</span>
                  </label>
                  <input
                    type="date"
                    name="arrivalDate"
                    value={bookingForm.arrivalDate}
                    onChange={handleBookingChange}
                    required
                    min={format(new Date(), 'yyyy-MM-dd')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    color: '#8A9BB0', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    تاريخ المغادرة <span style={{ color: '#D4AF37' }}>*</span>
                  </label>
                  <input
                    type="date"
                    name="departureDate"
                    value={bookingForm.departureDate}
                    onChange={handleBookingChange}
                    required
                    min={bookingForm.arrivalDate || format(new Date(), 'yyyy-MM-dd')}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
              </div>

              <div style={{ marginTop: '20px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  color: '#8A9BB0', 
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  طلبات خاصة
                </label>
                <textarea
                  name="specialRequests"
                  value={bookingForm.specialRequests}
                  onChange={handleBookingChange}
                  placeholder="أي طلبات خاصة للرحلة؟ (مثل: احتياجات غذائية، تنقلات، إلخ)"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: '1rem',
                    resize: 'vertical',
                    outline: 'none',
                    transition: 'border-color 0.3s ease',
                    fontFamily: 'var(--font-arabic)'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <button
                type="button"
                onClick={nextStep}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: '#D4AF37',
                  color: '#334155',
                  fontWeight: 'bold',
                  fontSize: '1.1rem',
                  border: 'none',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  marginTop: '25px',
                  transition: 'all 0.3s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#c5a030';
                  e.currentTarget.style.transform = 'scale(1.02)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#D4AF37';
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                التالي ←
              </button>
            </div>
          )}

          {currentStep === 1 && (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid rgba(212, 175, 55, 0.15)',
              borderRadius: '20px',
              padding: '30px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  color: '#8A9BB0', 
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  الاسم الكامل <span style={{ color: '#D4AF37' }}>*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={clientForm.fullName}
                  onChange={handleClientChange}
                  placeholder="أدخل اسمك الكامل"
                  required
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  color: '#8A9BB0', 
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  رقم الجوال <span style={{ color: '#D4AF37' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <span style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#FFFFFF',
                    color: '#D4AF37',
                    fontWeight: 'bold',
                    minWidth: '45px',
                    textAlign: 'center'
                  }}>
                    +
                  </span>
                  <input
                    type="tel"
                    name="phone"
                    value={clientForm.phone}
                    onChange={handleClientChange}
                    placeholder="966 5xxxxxxxx"
                    required
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    color: '#8A9BB0', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    البريد الإلكتروني
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={clientForm.email}
                    onChange={handleClientChange}
                    placeholder="example@email.com"
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  />
                </div>
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    color: '#8A9BB0', 
                    fontSize: '0.9rem',
                    fontWeight: '500'
                  }}>
                    الجنسية
                  </label>
                  <select
                    name="nationality"
                    value={clientForm.nationality}
                    onChange={handleClientChange}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: '#FFFFFF',
                      color: '#334155',
                      fontSize: '1rem',
                      outline: 'none',
                      transition: 'border-color 0.3s ease'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                  >
                    <option value="سعودي">سعودي</option>
                    <option value="إماراتي">إماراتي</option>
                    <option value="كويتي">كويتي</option>
                    <option value="قطري">قطري</option>
                    <option value="عُماني">عُماني</option>
                    <option value="بحريني">بحريني</option>
                    <option value="مصري">مصري</option>
                    <option value="أردني">أردني</option>
                    <option value="لبناني">لبناني</option>
                    <option value="أخرى">أخرى</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  color: '#8A9BB0', 
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  رقم جواز السفر
                </label>
                <input
                  type="text"
                  name="passportNumber"
                  value={clientForm.passportNumber}
                  onChange={handleClientChange}
                  placeholder="أدخل رقم جواز السفر (اختياري)"
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: '1rem',
                    outline: 'none',
                    transition: 'border-color 0.3s ease'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  color: '#8A9BB0', 
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}>
                  ملاحظات إضافية
                </label>
                <textarea
                  name="notes"
                  value={clientForm.notes}
                  onChange={handleClientChange}
                  placeholder="أي طلبات خاصة أو معلومات إضافية"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: '#FFFFFF',
                    color: '#334155',
                    fontSize: '1rem',
                    resize: 'vertical',
                    outline: 'none',
                    transition: 'border-color 0.3s ease',
                    fontFamily: 'var(--font-arabic)'
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#D4AF37'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={prevStep}
                  style={{
                    padding: '14px 30px',
                    background: 'transparent',
                    color: '#8A9BB0',
                    border: '1px solid #8A9BB0',
                    borderRadius: '30px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(138, 155, 176, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  ← السابق
                </button>
                <button
                  type="button"
                  onClick={nextStep}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: '#D4AF37',
                    color: '#334155',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    border: 'none',
                    borderRadius: '30px',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#c5a030';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#D4AF37';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  التالي →
                </button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div style={{
              background: '#FFFFFF',
              border: '1px solid rgba(212, 175, 55, 0.15)',
              borderRadius: '20px',
              padding: '30px',
              animation: 'fadeIn 0.3s ease'
            }}>
              <div style={{ marginBottom: '25px' }}>
                <h3 style={{ 
                  color: '#D4AF37', 
                  fontSize: '1.1rem',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  📎 المستندات المطلوبة
                </h3>
                <p style={{ color: '#8A9BB0', fontSize: '0.9rem', marginBottom: '15px' }}>
                  يمكنك رفع المستندات التالية (اختياري):
                </p>
                <ul style={{ 
                  color: '#8A9BB0', 
                  fontSize: '0.85rem',
                  listStyle: 'none',
                  padding: 0,
                  marginBottom: '15px'
                }}>
                  <li style={{ marginBottom: '5px' }}>• صورة جواز السفر</li>
                  <li style={{ marginBottom: '5px' }}>• صورة التأشيرة (إن وجدت)</li>
                  <li>• أي مستندات أخرى</li>
                </ul>

                <div style={{
                  border: '2px dashed rgba(212, 175, 55, 0.3)',
                  borderRadius: '16px',
                  padding: '30px',
                  textAlign: 'center',
                  background: 'rgba(255,255,255,0.02)',
                  transition: 'all 0.3s ease',
                  cursor: 'pointer'
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = '#D4AF37';
                  e.currentTarget.style.background = 'rgba(212, 175, 55, 0.05)';
                }}
                onDragLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.3)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const files = e.dataTransfer.files;
                  if (files) {
                    const newFiles: DocumentFile[] = Array.from(files).map(file => ({
                      file,
                      type: 'other',
                      name: file.name,
                    }));
                    setDocuments(prev => [...prev, ...newFiles]);
                  }
                }}
                onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input
                    id="file-upload"
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleDocumentUpload}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📤</div>
                  <p style={{ color: '#D4AF37', fontWeight: 'bold' }}>
                    اضغط أو اسحب الملفات هنا
                  </p>
                  <p style={{ color: '#4A5A6E', fontSize: '0.8rem' }}>
                    يدعم: PDF, JPG, PNG, DOC (حد أقصى 10MB)
                  </p>
                </div>

                {documents.length > 0 && (
                  <div style={{ marginTop: '15px' }}>
                    <p style={{ color: '#8A9BB0', fontSize: '0.9rem', marginBottom: '10px' }}>
                      {documents.length} ملف مرفوع:
                    </p>
                    {documents.map((doc, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: '#FFFFFF',
                        padding: '10px 15px',
                        borderRadius: '10px',
                        marginBottom: '8px'
                      }}>
                        <span style={{ color: '#334155', fontSize: '0.9rem' }}>
                          📄 {doc.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDocument(index)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#ff4444',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            padding: '0 5px'
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{
                background: 'rgba(212, 175, 55, 0.05)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '25px',
                border: '1px solid rgba(212, 175, 55, 0.1)'
              }}>
                <h4 style={{ color: '#D4AF37', marginBottom: '10px' }}>📋 ملخص الحجز</h4>
                {quoteLoading && (
                  <p style={{ color: '#8A9BB0', marginBottom: '10px' }}>جاري تحميل التسعير النهائي من الخادم...</p>
                )}
                {quoteError && (
                  <p style={{ color: '#ff8a8a', marginBottom: '10px' }}>{quoteError}</p>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.9rem' }}>
                  <span style={{ color: '#8A9BB0' }}>المنتج:</span>
                  <span style={{ color: '#334155' }}>{product.name_ar}</span>
                  
                  <span style={{ color: '#8A9BB0' }}>المدينة:</span>
                  <span style={{ color: '#334155' }}>{bookingForm.city}</span>
                  
                  <span style={{ color: '#8A9BB0' }}>تاريخ الوصول:</span>
                  <span style={{ color: '#334155' }}>
                    {bookingForm.arrivalDate && format(new Date(bookingForm.arrivalDate), 'dd MMMM yyyy', { locale: arSA })}
                  </span>
                  
                  <span style={{ color: '#8A9BB0' }}>تاريخ المغادرة:</span>
                  <span style={{ color: '#334155' }}>
                    {bookingForm.departureDate && format(new Date(bookingForm.departureDate), 'dd MMMM yyyy', { locale: arSA })}
                  </span>
                  
                  <span style={{ color: '#8A9BB0' }}>عدد الضيوف:</span>
                  <span style={{ color: '#334155' }}>{bookingForm.guests}</span>

                  <span style={{ color: '#8A9BB0' }}>عدد الليالي:</span>
                  <span style={{ color: '#334155' }}>{authoritativeQuote?.bookingDays ?? '-'}</span>

                  <span style={{ color: '#8A9BB0' }}>السعر/ليلة (خادم):</span>
                  <span style={{ color: '#334155' }}>
                    {authoritativeQuote ? `${authoritativeQuote.unitPrice} ${authoritativeQuote.currency}` : '—'}
                  </span>
                  
                  <span style={{ color: '#8A9BB0' }}>اسم العميل:</span>
                  <span style={{ color: '#334155' }}>{clientForm.fullName}</span>
                  
                  <span style={{ color: '#8A9BB0' }}>رقم الجوال:</span>
                  <span style={{ color: '#334155' }}>{clientForm.phone}</span>
                  
                  <span style={{ color: '#8A9BB0', fontWeight: 'bold' }}>الإجمالي:</span>
                  <span style={{ color: '#D4AF37', fontWeight: 'bold', fontSize: '1.1rem' }}>
                    {authoritativeQuote ? `${authoritativeQuote.totalAmount} ${authoritativeQuote.currency}` : '—'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={prevStep}
                  style={{
                    padding: '14px 30px',
                    background: 'transparent',
                    color: '#8A9BB0',
                    border: '1px solid #8A9BB0',
                    borderRadius: '30px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(138, 155, 176, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  ← السابق
                </button>
                <button
                  type="submit"
                  disabled={submitting || quoteLoading || !authoritativeQuote}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: '#D4AF37',
                    color: '#334155',
                    fontWeight: 'bold',
                    fontSize: '1rem',
                    border: 'none',
                    borderRadius: '30px',
                    cursor: (submitting || quoteLoading || !authoritativeQuote) ? 'not-allowed' : 'pointer',
                    opacity: (submitting || quoteLoading || !authoritativeQuote) ? 0.7 : 1,
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px'
                  }}
                  onMouseEnter={(e) => {
                    if (!submitting && !quoteLoading && authoritativeQuote) {
                      e.currentTarget.style.background = '#c5a030';
                      e.currentTarget.style.transform = 'scale(1.02)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!submitting && !quoteLoading && authoritativeQuote) {
                      e.currentTarget.style.background = '#D4AF37';
                      e.currentTarget.style.transform = 'scale(1)';
                    }
                  }}
                >
                  {submitting ? (
                    <>
                      <span style={{
                        display: 'inline-block',
                        width: '20px',
                        height: '20px',
                        border: '2px solid #D4AF37',
                        borderTop: '2px solid transparent',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite'
                      }} />
                      جاري الحجز...
                    </>
                  ) : (
                    '🛡️ تأكيد الحجز'
                  )}
                </button>
              </div>
            </div>
          )}
        </form>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          marginTop: '30px',
          flexWrap: 'wrap'
        }}>
          <Link 
            href="/services" 
            style={{
              color: '#8A9BB0',
              textDecoration: 'none',
              fontSize: '0.9rem',
              transition: 'color 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#D4AF37'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#8A9BB0'}
          >
            ← العودة إلى الخدمات
          </Link>
          <Link 
            href="/" 
            style={{
              color: '#8A9BB0',
              textDecoration: 'none',
              fontSize: '0.9rem',
              transition: 'color 0.3s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#D4AF37'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#8A9BB0'}
          >
            🏠 الرئيسية
          </Link>
        </div>

        <style>{`
          @keyframes fadeIn {
            from { 
              opacity: 0; 
              transform: translateY(10px); 
            }
            to { 
              opacity: 1; 
              transform: translateY(0); 
            }
          }
          
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          
          ::-webkit-scrollbar {
            width: 8px;
          }
          ::-webkit-scrollbar-track {
            background: #334155;
          }
          ::-webkit-scrollbar-thumb {
            background: #D4AF37;
            border-radius: 4px;
          }
          ::-webkit-scrollbar-thumb:hover {
            background: #c5a030;
          }
        `}</style>
      </div>
    </div>
  );
}
