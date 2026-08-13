import { travelportRequest } from "./client";

export async function searchTravelportFlights() {
  const departureDate = "2026-08-20";

  const body = {
    CatalogProductOfferingsQueryRequest: {
      CatalogProductOfferingsRequest: {
        "@type": "CatalogProductOfferingsRequestAir",
        offersPerPage: 10,
        contentSourceList: ["GDS"],
        PassengerCriteria: [
          {
            "@type": "PassengerCriteria",
            number: 1,
            passengerTypeCode: "ADT",
          },
        ],
        SearchCriteriaFlight: [
          {
            "@type": "SearchCriteriaFlight",
            departureDate,
            From: { value: "CAI" },
            To: { value: "RUH" },
          },
        ],
      },
    },
  };

  return travelportRequest("11/air/catalog/search/catalogproductofferings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
