# Task #167 — approved price calculation and catalogue reconciliation

Date: 2026-09-27. Owner: Codex — ChatGPT Work Mode. Independent reviewer: UNASSIGNED.

Branch: `feat/drive-catalog-september27`. Base: `c8c91f33f3ea017bf09f0d4ee32747c0aae425b9`.

**Prepared, not published.** All 27 rows preserve the source names and years. Customer price = highest USD price × 1.10, once. The JSON stores exact integer cents. No live rates, supplier records or Abu Al-Hana inventory changed.

| Row | Source vehicle | Source years | Higher USD | With 10% USD |
|---|---|---|---:|---:|
| 1 | Mercedes E200 | 21 - 22 - 2… | 170 | 187.00 |
| 2 | Mercedes S500 | 22 / 23 | 500 | 550.00 |
| 3 | Mercedes G-Class | 22 - 23 | 550 | 605.00 |
| 4 | Mercedes V250 | 22 to 25 | 250 | 275.00 |
| 5 | Mercedes V300 | 25 - 26 - 27 | 400 | 440.00 |
| 6 | Kia carval | 26 | 200 | 220.00 |
| 7 | Kia K4 | 22 - 23 | 85 | 93.50 |
| 8 | Kia Sportage | 26 | 120 | 132.00 |
| 9 | Hyundai cn7 | 22 / 23 | 70 | 77.00 |
| 10 | Hyundai tuycan | 22 / 25 | 100 | 110.00 |
| 11 | Hyundai accent | 22 / 26 | 60 | 66.00 |
| 12 | Jetour T2 | 26 / 27 | 150 | 165.00 |
| 13 | Jetour X70 | 26 | 80 | 88.00 |
| 14 | Jetour X90 | 26 | 100 | 110.00 |
| 15 | Soueast S05 | 26 | 80 | 88.00 |
| 16 | Soueast S09 | 26 | 100 | 110.00 |
| 17 | Soueast S07 | 26 | 80 | 88.00 |
| 18 | Range Rover | 22 | 280 | 308.00 |
| 19 | Range Rover Sport | 24 - 25 | 600 | 660.00 |
| 20 | Nissan Sunny | 22 / 25 | 60 | 66.00 |
| 21 | Nissan Patrol | 22 - 23 | 400 | 440.00 |
| 22 | Nissan [model not stated] | 26 | 700 | 770.00 |
| 23 | Land Cruiser | 20 - 21 | 350 | 385.00 |
| 24 | Land Cruiser | 22 - 23 - 24 - 25 | 450 | 495.00 |
| 25 | Escalade | 26 | 1000 | 1100.00 |
| 26 | H1 | not stated | 150 | 165.00 |
| 27 | Hiace | not stated | 150 | 165.00 |

## Reconciliation

- Six candidate model matches: E200 (not AMG Line), G-Class, T2, X90, Range Rover, Sunny. Match is not publication approval across different source years.
- Preserve AMG Line, T1 and full-size Range Rover 2025; they have no exact new rate row.
- Range Rover Sport is a distinct new model. The unnamed Nissan 2026 remains unmapped.
- Existing full-size Range Rover entries shared one beige asset. A separate green visualization now maps to `range-rover-2025.webp`; no change to model, rate, year contract or supplier availability. This is not a Sport image and does not promise delivered color.
- All other approved assets remain unchanged. New model photos remain pending exact model confirmation; do not reuse a different model image.

## Required product facts before live import

1. What service and rate unit does this sheet cover (airport transfer or chauffeured daily service)? Existing catalogue has separate prices, so do not write the same value into both.
2. Does the new list override the prior 2025 minimum for supplied model years? Do not advertise 2025+ for 2020–2024 inventory.
3. Confirm supplier/operations ownership and the ambiguous names/years noted in JSON.

Live release must update authoritative `drive_managed_offers` and the catalogue together through the existing reviewed import/migration workflow; frontend-only price replacement is insufficient.

WhatsApp Task #166 remains the primary separate workstream; no WhatsApp account/configuration changes in this task.
