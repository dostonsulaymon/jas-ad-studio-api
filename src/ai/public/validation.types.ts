export type Severity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  field: string;
  message: string;
  severity: Severity;
}

export interface ValidationReport {
  issues: ValidationIssue[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  ok: boolean;
}
