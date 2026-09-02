import { AdminCurrency, AdminStatusText, AdminText } from '@/components/admin/AdminLocale';

type BookingRow = {
  id: string;
  booking_reference: string;
  guest_name?: string;
  product_name?: string;
  status?: string;
  total_price?: number;
  total_amount?: number;
  currency?: string;
};

export default function BookingsTable({ bookings }: { bookings: BookingRow[] }) {
  if (!bookings.length) {
    return <div style={{ color: '#8A9BB0', padding: '20px 0' }}><AdminText ar="لا توجد حجوزات إنتاج حالياً." en="There are no Production bookings right now." /></div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: '#334155' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ textAlign: 'start', padding: '10px 8px', color: '#D4AF37' }}><AdminText ar="المرجع" en="Reference" /></th>
            <th style={{ textAlign: 'start', padding: '10px 8px', color: '#D4AF37' }}><AdminText ar="العميل" en="Customer" /></th>
            <th style={{ textAlign: 'start', padding: '10px 8px', color: '#D4AF37' }}><AdminText ar="المنتج" en="Product" /></th>
            <th style={{ textAlign: 'start', padding: '10px 8px', color: '#D4AF37' }}><AdminText ar="الحالة" en="Status" /></th>
            <th style={{ textAlign: 'start', padding: '10px 8px', color: '#D4AF37' }}><AdminText ar="الإجمالي" en="Total" /></th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id} style={{ borderBottom: '1px solid #FFFFFF' }}>
              <td style={{ padding: '10px 8px' }}>{booking.booking_reference}</td>
              <td style={{ padding: '10px 8px' }}>{booking.guest_name}</td>
              <td style={{ padding: '10px 8px' }}>{booking.product_name}</td>
              <td style={{ padding: '10px 8px' }}><AdminStatusText value={booking.status} /></td>
              <td style={{ padding: '10px 8px' }}><AdminCurrency value={Number(booking.total_amount ?? booking.total_price ?? 0)} currency={booking.currency ?? 'SAR'} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
