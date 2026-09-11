export type CapturePhoto = {
  id: string;
  url: string;
};

export type CaptureStatus =
  | "waiting"
  | "capturing"
  | "ready"
  | "generating"
  | "complete"
  | "expired";

export type CaptureSessionState = {
  token: string;
  status: CaptureStatus;
  hint: string;
  itemId: string | null;
  partSheetId?: string | null;
  mode?: "add" | "analyze";
  locationId?: string | null;
  locationLabel?: string | null;
  maxPhotos: number;
  photos: CapturePhoto[];
  expiresAt?: string;
  url?: string;
  slots?: { id: string; path: string; uploadUrl: string }[];
  sessionUploadUrl?: string;
  item?: {
    id: string;
    sku?: string | null;
    title: string;
    model: string | null;
    status: string;
    locationLabel: string | null;
    photos: { url: string; isPrimary: boolean }[];
    draft: { suggestedPrice: number | null; status: string } | null;
  };
  partSheet?: {
    id: string;
    code: string;
    masterTitle: string;
    locationLabel: string | null;
    lineCount: number;
  };
};
