export type PortalOwnerKind = 'drive_partner' | 'stay_supplier';

export type MediaWorkflowStatus =
  | 'provisional_seed'
  | 'pending_validation'
  | 'needs_supplier_action'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'archived';

export type ProductWorkflowStatus =
  | 'draft'
  | 'needs_confirmation'
  | 'submitted'
  | 'validation_failed'
  | 'pending_review'
  | 'approved'
  | 'published';

export type ReviewAction = 'APPROVE' | 'REJECT' | 'REQUEST_REPLACEMENT';

export type PortalAssetRecord = {
  id: string;
  ownerKind: PortalOwnerKind;
  ownerLabel: string;
  assetType: 'vehicle' | 'apartment_unit';
  title: string;
  location: string;
  make: string;
  model: string;
  vehicleCategory: string;
  plateNumber: string;
  capacity: string;
  amenities: string[];
  pricing: string;
  availability: string;
  cancellationPolicy: string;
  accessRules: string;
  optionalVideoUrl: string;
  futureVideoUploadEnabled: boolean;
  verificationStatus: string;
  dataStatus: ProductWorkflowStatus;
  visualConfidence: 'verified' | 'needs_supplier_confirmation';
  needsConfirmationFields: string[];
  submittedAt: string;
  updatedAt: string;
};

export type PortalAssetMedia = {
  id: string;
  assetId: string;
  ownerKind: PortalOwnerKind;
  label: string;
  url: string;
  origin: 'whatsapp_screenshot' | 'whatsapp_photo' | 'library' | 'provider_upload';
  mimeType: string;
  sizeBytes: number;
  hash: string;
  sortOrder: number;
  status: MediaWorkflowStatus;
  technicalValidation: {
    supportedFileType: boolean;
    fileSize: boolean;
    minDimensions: boolean | 'not_available';
    corruptFile: boolean;
    duplicateImage: boolean;
    basicImageQuality: boolean | 'not_available';
    correctAssociation: boolean;
    malwareSafeControls: boolean;
    metadataStripped: boolean | 'not_available';
    messages: string[];
  };
  submittedAt: string;
  updatedAt: string;
};

export type ReviewQueueItem = {
  id: string;
  ownerKind: PortalOwnerKind;
  assetId: string;
  mediaId: string;
  oldImageUrl: string;
  newImageUrl: string;
  partnerOrSupplier: string;
  technicalValidationStatus: 'pass' | 'fail';
  technicalSummary: string[];
  changedFields: string[];
  submittedAt: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'needs_supplier_action';
  actionBy?: string;
  actionAt?: string;
  actionReason?: string;
};

export type ContractAssociation = {
  id: string;
  ownerKind: PortalOwnerKind;
  ownerLabel: string;
  contractRef: string;
  contractStatus: 'draft' | 'under_legal_review' | 'approved_not_signed' | 'signed';
  notes: string;
};

export type PortalOnboardingStore = {
  assets: PortalAssetRecord[];
  media: PortalAssetMedia[];
  reviewQueue: ReviewQueueItem[];
  contracts: ContractAssociation[];
};
