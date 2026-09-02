import { AdminCurrency, AdminText } from '@/components/admin/AdminLocale';

export default function AdminStats({ stats }: { stats: { total: number; pending: number; confirmed: number; completed: number; revenue: number } }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}><AdminText ar="إجمالي حجوزات الإنتاج" en="Total Production bookings" /></div>
        <div style={{ color: '#D4AF37', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.total}</div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}><AdminText ar="قيد الانتظار" en="Pending" /></div>
        <div style={{ color: '#334155', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.pending}</div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}><AdminText ar="مؤكد" en="Confirmed" /></div>
        <div style={{ color: '#334155', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.confirmed}</div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}><AdminText ar="الإيرادات المؤكدة والمدفوعة" en="Confirmed paid revenue" /></div>
        <div style={{ color: '#D4AF37', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}><AdminCurrency value={stats.revenue} /></div>
      </div>
    </div>
  );
}
