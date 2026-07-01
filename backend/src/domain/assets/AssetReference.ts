export type AssetKind = 'upload' | 'generated';

export interface AssetReference {
  id: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  sourceJobId?: string | null;
  createdAt: Date;
  kind: AssetKind;
}
