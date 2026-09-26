QARICA UI PIXEL FIX — EMR COMMAND CENTER
1) Upload/replace exactly: src/components/emr-command-center.tsx
2) Wait for Vercel Ready.
3) Ctrl+Shift+R then open /emr.
No database migration is required for this patch.
This patch keeps existing API/RBAC/data logic and replaces the EMR presentation layer to match the approved Command Center visual hierarchy.
