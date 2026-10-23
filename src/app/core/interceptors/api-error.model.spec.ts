import { ApiError, isApiError, ErrorDetail } from './api-error.model';

describe('ApiError', () => {
  const detail: ErrorDetail = {
    code: 'IAM_DUPLICATE_EMAIL',
    message: 'A GCID with this email already exists',
    correlation_id: 'abc-123',
    details: {
      fields: [{ field: 'email', code: 'IAM_EMAIL_REQUIRED', message: 'Email is required' }],
    },
  };

  it('should construct with status and error detail', () => {
    const err = new ApiError(409, detail);
    expect(err.status).toBe(409);
    expect(err.code).toBe('IAM_DUPLICATE_EMAIL');
    expect(err.message).toBe('A GCID with this email already exists');
    expect(err.correlationId).toBe('abc-123');
    expect(err.fieldErrors).toHaveLength(1);
    expect(err.fieldErrors[0].field).toBe('email');
    expect(err.name).toBe('ApiError');
  });

  it('should default fieldErrors to empty array when no details', () => {
    const err = new ApiError(500, {
      code: 'IAM_INTERNAL_ERROR',
      message: 'Unexpected error',
      correlation_id: 'def-456',
    });
    expect(err.fieldErrors).toEqual([]);
    expect(err.details).toEqual({});
  });
});

describe('isApiError', () => {
  it('should return true for ApiError instances', () => {
    const err = new ApiError(400, {
      code: 'IAM_VALIDATION_FAILED',
      message: 'Validation failed',
      correlation_id: 'ghi-789',
    });
    expect(isApiError(err)).toBe(true);
  });

  it('should return false for plain Error', () => {
    expect(isApiError(new Error('plain'))).toBe(false);
  });

  it('should return false for non-error values', () => {
    expect(isApiError(null)).toBe(false);
    expect(isApiError('string')).toBe(false);
    expect(isApiError(42)).toBe(false);
  });
});
