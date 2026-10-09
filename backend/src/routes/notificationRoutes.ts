import { Router } from "express";
import { authMiddleware, optionalOperator, AuthenticatedRequest } from "../middleware/auth";
import { notificationInbox,NotificationInboxError } from "../services/notificationInboxService";
import {SessionError} from "../services/sessionService";
import { ContactService, ContactError } from "../services/contactService";

export const notificationRouter = Router();
notificationRouter.use((_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
notificationRouter.use(authMiddleware);

const contactFailure=(error:unknown,res:any)=>{const known=error instanceof ContactError||error instanceof SessionError;if(error instanceof ContactError&&error.retryAfter)res.set('Retry-After',String(error.retryAfter));res.status(known?error.status:503).json({error:known?error.code:'CONTACT_UNAVAILABLE'});};
const contactQuery=(req:AuthenticatedRequest)=>{if(Object.keys(req.query).length)throw new ContactError('CONTACT_INVALID_INPUT');};
notificationRouter.get('/contact',(req:AuthenticatedRequest,res)=>{try{contactQuery(req);res.json({contact:ContactService.view(req.user!.userId,req.sessionProof)});}catch(e){contactFailure(e,res);}});
notificationRouter.post('/contact/request',(req:AuthenticatedRequest,res)=>{try{contactQuery(req);res.status(202).json({contact:ContactService.request(req.user!.userId,req.body,req.ip||req.socket.remoteAddress||'unknown',req.sessionProof)});}catch(e){contactFailure(e,res);}});
notificationRouter.post('/contact/verify',(req:AuthenticatedRequest,res)=>{try{contactQuery(req);res.json({contact:ContactService.verify(req.user!.userId,req.body,req.sessionProof)});}catch(e){contactFailure(e,res);}});
notificationRouter.delete('/contact',(req:AuthenticatedRequest,res)=>{try{contactQuery(req);if(req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))throw new ContactError('CONTACT_INVALID_INPUT');res.json({contact:ContactService.remove(req.user!.userId,req.sessionProof)});}catch(e){contactFailure(e,res);}});

const inboxFailure=(error:unknown,res:any)=>{const known=error instanceof NotificationInboxError||error instanceof SessionError;res.status(known?error.status:503).json({error:known?error.code:'NOTIFICATION_UNAVAILABLE'});};
notificationRouter.get('/',optionalOperator,(req:AuthenticatedRequest,res)=>{try{res.json(notificationInbox.page(req.user!.userId,req.query,req.sessionProof));}catch(e){inboxFailure(e,res);}});
notificationRouter.get('/preferences',(req:AuthenticatedRequest,res)=>{try{if(Object.keys(req.query).length)throw new NotificationInboxError('NOTIFICATION_INVALID_QUERY',400);res.json(notificationInbox.settings(req.user!.userId,req.sessionProof));}catch(e){inboxFailure(e,res);}});
notificationRouter.put('/preferences',(req:AuthenticatedRequest,res)=>{try{if(Object.keys(req.query).length)throw new NotificationInboxError('NOTIFICATION_INVALID_QUERY',400);res.json({preferences:notificationInbox.updatePreferences(req.user!.userId,req.body,req.sessionProof)});}catch(e){inboxFailure(e,res);}});
notificationRouter.post('/:id/read',optionalOperator,(req:AuthenticatedRequest,res)=>{try{if(Object.keys(req.query).length||req.body!==undefined&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).length))throw new NotificationInboxError('NOTIFICATION_INVALID_INPUT',400);res.json({notification:notificationInbox.markRead(req.user!.userId,req.params.id,req.sessionProof)});}catch(e){inboxFailure(e,res);}});
