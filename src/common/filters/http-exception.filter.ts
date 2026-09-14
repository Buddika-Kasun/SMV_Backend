import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

// Define the error response type
interface ErrorResponse {
  success: boolean;
  message: string;
  error: string | null;
  timestamp: string;
  path: string;
  statusCode: number;
  validationErrors?: string[];
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let error: string | null = null;
    let validationErrors: string[] = [];

    // Handle known HTTP exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === "object") {
        const resp = exceptionResponse as any;
        message = resp.message || exception.message;
        error = resp.error || null;

        // Extract validation errors if present
        if (resp.message && Array.isArray(resp.message)) {
          validationErrors = resp.message;
        }
      } else {
        message = exception.message;
      }
    }
    // Handle standard errors
    else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message || "Internal server error";
      error = exception.name || "Error";

      // Log the error for debugging
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    }
    // Handle unknown exceptions
    else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "Internal server error";
      error = "UnknownError";

      this.logger.error("Unknown exception type", exception);
    }

    // Build the error response with explicit typing
    const errorResponse: ErrorResponse = {
      success: false,
      message: message,
      error: error,
      timestamp: new Date().toISOString(),
      path: request.url,
      statusCode: status,
    };

    // Add validation errors if present
    if (validationErrors.length > 0) {
      errorResponse.validationErrors = validationErrors;
    }

    response.status(status).json(errorResponse);
  }
}
