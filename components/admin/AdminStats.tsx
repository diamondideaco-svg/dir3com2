export default function AdminStats({ stats }: { stats: { total: number; pending: number; confirmed: number; completed: number; revenue: number } }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}>إجمالي الحجوزات</div>
        <div style={{ color: '#D4AF37', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.total}</div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}>قيد الانتظار</div>
        <div style={{ color: '#334155', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.pending}</div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}>مؤكد</div>
        <div style={{ color: '#334155', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.confirmed}</div>
      </div>
      <div style={{ background: '#FFFFFF', border: '1px solid rgba(212, 175, 55, 0.1)', borderRadius: '16px', padding: '18px' }}>
        <div style={{ color: '#8A9BB0', fontSize: '0.9rem' }}>الإيرادات</div>
        <div style={{ color: '#D4AF37', fontSize: '1.6rem', fontWeight: 'bold', marginTop: '6px' }}>{stats.revenue} ريال</div>
      </div>
    </div>
  );
}
