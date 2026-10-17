export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (message = 'Recurso no encontrado') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
