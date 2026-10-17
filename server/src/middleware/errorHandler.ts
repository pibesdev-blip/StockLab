import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { HttpError } from '../lib/httpError';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        message: 'Datos inválidos',
        details: err.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })),
      },
    });
    return;
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { message: err.message, details: err.details } });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'campo único';
      res.status(409).json({ error: { message: `Ya existe un registro con ese valor (${target})` } });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { message: 'Recurso no encontrado' } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({ error: { message: 'La operación viola una relación existente' } });
      return;
    }
  }

  // Errores de express.json(): JSON mal formado, body demasiado grande, encoding no soportado…
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { message: 'El cuerpo de la petición no es JSON válido' } });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: { message: 'El cuerpo de la petición es demasiado grande' } });
    return;
  }
  if (typeof err?.status === 'number' && err.status >= 400 && err.status < 500 && err.expose) {
    res.status(err.status).json({ error: { message: 'Petición inválida' } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { message: 'Error interno del servidor' } });
};
