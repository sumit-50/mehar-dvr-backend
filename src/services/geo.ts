export const VISIT_PURPOSES = [
  "Customer Meeting",
  "Document Collection",
  "Payment Follow-up",
  "Verification",
  "Bank Visit",
  "Document Submission",
  "Dealer Visit",
  "Collection Visit",
  "Site Survey",
  "Service Call",
  "Delivery",
  "Other",
] as const;

export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const MAX_GPS_ACCURACY_METERS = 500;
export const FIX_GPS_ACCURACY_METERS = 500;
export const DEFAULT_RADIUS_METERS = 100;

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function isKnownPurpose(value: string): boolean {
  return VISIT_PURPOSES.includes(value as VisitPurpose);
}
