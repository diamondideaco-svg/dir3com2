# DIR3COM canonical UI manifest

Date: 2026-08-25  
Status: `CANONICAL_UI_STATUS = FROZEN`

This manifest records the single approved runtime UI baseline before DABRA orchestration. It does not introduce a redesign or new product behavior.

| Surface | Canonical route | Canonical implementation |
| --- | --- | --- |
| Home | `/` | `app/page.tsx` → `components/approved/ApprovedVisualPage.tsx` |
| Services | `/services` | `app/services/page.tsx` → `components/home/PlatformFoundationHome.tsx` |
| Fly | `/services/fly` | `components/services/ServicePageContent.tsx` |
| Stay | `/services/stay` | `components/services/ServicePageContent.tsx` |
| Drive | `/services/drive` | `components/services/ServicePageContent.tsx` |
| Concierge | `/services/concierge` | `components/services/ServicePageContent.tsx` |
| VIP | `/services/vip` | `components/services/ServicePageContent.tsx` |
| Login | `/login` | `app/(auth)/login/page.tsx` |
| Registration | `/register` | `app/(auth)/register/page.tsx` |
| Customer account | `/my-account` | `app/my-account/page.tsx` |
| Partner portal | `/partner-portal` | `app/partner-portal/page.tsx` |
| Administration | `/admin/*` | `app/admin/layout.tsx` and scoped admin routes |
| Global header/footer | all public routes | `components/layout/SiteShell.tsx` → `Header.tsx` / `Footer.tsx` |

The superseded `/drive` design-specific route was removed. `/services/drive` is the only current Drive UI route.

The legacy purge removed only source modules with no route, import, test, or runtime consumer. Git history remains the recovery record for all removed files.
