import { ApiResponse } from '../shared/types';

/** Standard 200-success envelope matching the documented ApiResponse contract. */
export function ok<T>(data?: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    message,
    data,
    timestamp: new Date().toISOString(),
  };
}

/** Standard error envelope. */
export function fail<T = undefined>(error: string, message?: string): ApiResponse<T> {
  return {
    success: false,
    error,
    message,
    timestamp: new Date().toISOString(),
  };
}