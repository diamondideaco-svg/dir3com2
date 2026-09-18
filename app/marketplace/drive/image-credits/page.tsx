import { DRIVE_CURRENT_IMAGE_PROVENANCE } from '@/lib/drive/image-rights';
export default function DriveImageCredits() {
  return <main className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-bold">مصدر الصور / Image provenance</h1><p>Customer-facing vehicle images are original DIR3COM-generated 2025 catalogue visualizations, not copied manufacturer or competitor photographs. Trademarks identify the requested vehicle class; no manufacturer endorsement is implied.</p><ul className="space-y-6 py-6">{DRIVE_CURRENT_IMAGE_PROVENANCE.map(asset=><li key={asset.id}><strong>{asset.file}</strong><p>{asset.method}</p><p>{asset.changes}</p></li>)}</ul></main>;
}
