import { DRIVE_IMAGE_RIGHTS } from '@/lib/drive/image-rights';
export default function DriveImageCredits() {
  return <main className="mx-auto max-w-4xl p-6"><h1 className="text-2xl font-bold">حقوق الصور / Image credits</h1><p>Vehicle catalogue photography. No endorsement by photographers or manufacturers is implied.</p><ul className="space-y-6 py-6">{DRIVE_IMAGE_RIGHTS.map(asset=><li key={asset.id}><a href={asset.source}>{asset.file}</a><p>{asset.author} — <a href={asset.licenseUrl}>{asset.license}</a></p><p>{asset.changes}</p></li>)}</ul></main>;
}
