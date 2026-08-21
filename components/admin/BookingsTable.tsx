type BookingRow = {
  id: string;
  booking_reference: string;
  guest_name?: string;
  product_name?: string;
  status?: string;
  total_price?: number;
};

export default function BookingsTable({ bookings }: { bookings: BookingRow[] }) {
  if (!bookings.length) {
    return <div style={{ color: '#8A9BB0', padding: '20px 0' }}>لا توجد حجوزات حتى الآن.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', color: 'var(--color-navy)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37' }}>المرجع</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37' }}>العميل</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37' }}>المنتج</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37' }}>الحالة</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#D4AF37' }}>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={{ padding: '10px 8px' }}>{booking.booking_reference}</td>
              <td style={{ padding: '10px 8px' }}>{booking.guest_name}</td>
              <td style={{ padding: '10px 8px' }}>{booking.product_name}</td>
              <td style={{ padding: '10px 8px' }}>{booking.status}</td>
              <td style={{ padding: '10px 8px' }}>{booking.total_price} ريال</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
