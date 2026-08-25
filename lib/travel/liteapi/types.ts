export type LiteApiErrorBody = { error?: { code?: number | string; message?: string; description?: string } };

export type LiteApiRateTotal = { amount?: number | string; currency?: string };
export type LiteApiRate = {
  name?: string;
  mappedRoomId?: number | string;
  boardName?: string;
  retailRate?: { total?: LiteApiRateTotal[] };
  cancellationPolicies?: { refundableTag?: string; cancelPolicyInfos?: Array<{ cancelTime?: string }> };
};
export type LiteApiRoomType = { offerId?: string; rates?: LiteApiRate[] };
export type LiteApiHotelRate = { hotelId?: string; roomTypes?: LiteApiRoomType[] };
export type LiteApiHotel = { id?: string; hotelId?: string; name?: string; address?: string; rating?: number; main_photo?: string; mainPhoto?: string };
export type LiteApiRatesResponse = { data?: LiteApiHotelRate[]; hotels?: LiteApiHotel[]; sandbox?: boolean; error?: LiteApiErrorBody["error"] };
