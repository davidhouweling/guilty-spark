const HALO_MAP_THUMBNAIL_BASE = "https://blobs-infiniteugc.svc.halowaypoint.com/ugcstorage/map";

export const MAP_PREVIEW_URLS: Readonly<Record<string, string>> = {
  Aquarius: `${HALO_MAP_THUMBNAIL_BASE}/667072ae-ba00-4414-adda-8203e8c49295/9cce4f7e-cd2e-470f-93eb-a2725958f8bd/images/thumbnail.png`,
  Empyrean: `${HALO_MAP_THUMBNAIL_BASE}/70dd38c5-2eb7-4db3-8901-0dfca292ff18/8c4ab697-8630-47bf-b8a8-7d49a5e91b3c/images/thumbnail.jpg`,
  Lattice: `${HALO_MAP_THUMBNAIL_BASE}/1a6cfc2e-ec86-48e1-9464-1ce1bff6ed48/3a382104-9b89-4e6e-aa18-0affaa98f478/images/thumbnail.jpg`,
  "Live Fire": `${HALO_MAP_THUMBNAIL_BASE}/309253f8-7a75-48ff-83e1-e7fb3db2ac47/86a644f0-5063-40b8-b601-ce361439da72/images/thumbnail.jpg`,
  Origin: `${HALO_MAP_THUMBNAIL_BASE}/46a8319c-2c63-46ee-9382-788906dcb049/82e20c0a-ca3d-450a-a797-f5ed277a7dc2/images/thumbnail.jpg`,
  Recharge: `${HALO_MAP_THUMBNAIL_BASE}/336b5174-3579-4fd8-b2f0-922e4a5f7628/c0c6705e-167b-4335-afe0-2bafc7290f40/images/thumbnail.png`,
  Solitude: `${HALO_MAP_THUMBNAIL_BASE}/4a5e5612-2b2e-4375-a0b3-9335a68815f3/77710e1b-d9bc-42fd-a74b-918c27387783/images/thumbnail.jpg`,
  Streets: `${HALO_MAP_THUMBNAIL_BASE}/e23ea388-9bcb-4180-a0dc-fbe987751b9e/bc130bc8-6610-458d-b04a-ead6392824c4/images/thumbnail.png`,
};

export function getMapPreviewUrl(map: string): string | null {
  return MAP_PREVIEW_URLS[map] ?? null;
}
