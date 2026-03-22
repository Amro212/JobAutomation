export type ApplyFieldStep = {
  kind: 'field';
  name: string;
  selector: string;
  value: string;
};

export type ApplyUploadStep = {
  kind: 'upload';
  name: string;
  selector: string;
  filePath: string;
};

export type ApplyStopBeforeSubmitStep = {
  kind: 'stop';
  name: string;
  selector: string;
  details?: Record<string, unknown>;
};

export type FormStep = ApplyFieldStep | ApplyUploadStep | ApplyStopBeforeSubmitStep;
