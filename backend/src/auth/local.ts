import type { RequestHandler, Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { HttpError } from '../errors.js';

export interface Caller { userId: string; email: string; name: string }

export function localAuth(db: DatabaseSync): RequestHandler {
  return (req, res, next) => {
    const id = req.get('X-Dev-User-Id');
    const user = id && db.prepare('SELECT userId, email, name FROM users WHERE userId = ? AND confirmed = 1').get(id);
    if (!user) throw new HttpError(401, 'UNAUTHENTICATED', 'Choose a registered local test user.');
    res.locals.caller = user;
    next();
  };
}

export function caller(res: Response): Caller {
  return res.locals.caller as Caller;
}
