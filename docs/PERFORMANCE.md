# Performance Notes

## Current Priorities
- Keep server components for data-heavy pages
- Avoid unnecessary client-side state and prop drilling
- Prefer shared server helpers for repeated database access

## Future Optimization Opportunities
- Add caching at the server/helper layer where data is read frequently
- Split large views into smaller lazy-loaded sections when the app grows
- Review bundle size as new UI is added
