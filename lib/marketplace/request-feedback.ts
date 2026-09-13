export function marketplaceRequestErrorMessage(status: number, en: boolean): string {
  if (status === 401) return en ? 'Your session has expired. Sign in and try again.' : 'انتهت جلسة الدخول. سجّل الدخول ثم حاول مجددًا.';
  if (status === 400) return en ? 'Check the requested date and number of travellers, then try again.' : 'راجع التاريخ المطلوب وعدد المسافرين ثم حاول مجددًا.';
  if (status === 409) return en ? 'This service is no longer eligible for this request. Refresh its details.' : 'هذه الخدمة لم تعد متاحة لهذا النوع من الطلب. حدّث تفاصيلها.';
  return en ? 'We could not submit your request. Please try again shortly.' : 'تعذر إرسال طلبك. حاول مجددًا بعد قليل.';
}
