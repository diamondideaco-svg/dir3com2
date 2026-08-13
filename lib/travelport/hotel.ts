import { travelportRequest } from "./client";

export type TravelportPropertyKey = { chainCode: string; propertyCode: string };

export async function testTravelportHotels() {
  const body = {
    PropertiesQuerySearch: {
      CheckInDate: "2026-08-20",
      CheckOutDate: "2026-08-22",
      AggregatorList: ["TVPT"],
      RoomStayCandidate: [
        {
          "@type": "RoomStayCandidate",
          GuestCounts: {
            "@type": "GuestCounts",
            GuestCount: [
              {
                "@type": "GuestCount",
                count: 1,
                ageQualifyingCode: "10",
              },
            ],
          },
        },
      ],
      SearchBy: {
        "@type": "SearchByCity",
        SearchRadius: { value: 10, unitOfDistance: "Kilometers" },
        SearchCity: "CAI",
      },
    },
  };

  return travelportRequest("11/hotel/search/properties/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getTravelportHotelAvailability(property: TravelportPropertyKey) {
  const body = {
    CatalogOfferingsQueryRequest: {
      CatalogOfferingsRequest: [
        {
          "@type": "CatalogOfferingsRequestHospitality",
          StayDates: { start: "2026-08-20", end: "2026-08-22" },
          HotelSearchCriterion: {
            "@type": "HotelSearchCriterion",
            AggregatorList: ["TVPT"],
            numberOfRooms: 1,
            PropertyRequest: [
              { "@type": "PropertyRequest", PropertyKey: { "@type": "PropertyKey", ...property } },
            ],
            RoomStayCandidates: {
              "@type": "RoomStayCandidates",
              RoomStayCandidate: [
                {
                  "@type": "RoomStayCandidate",
                  GuestCounts: {
                    "@type": "GuestCounts",
                    GuestCount: [{ "@type": "GuestCount", count: 1, ageQualifyingCode: "10" }],
                  },
                },
              ],
            },
          },
        },
      ],
    },
  };
  return travelportRequest("11/hotel/availability/catalogofferingshospitality", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
