import { Request, Response, NextFunction } from "express";
import {operatorEnrollmentService} from "../services/operatorEnrollment";
import {OperatorEnrollmentError} from "../domain/operatorEnrollment";
import {store} from "../db/store";
import {SessionService,SessionError,SessionProof} from "../services/sessionService";

export interface AuthenticatedRequest extends Request {
  sessionProof?:SessionProof;
  user?: {
    userId: string;
    email: string;
    roles: ("buyer" | "seller" | "operator")[];
    activeWallet: string | null;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (typeof authHeader!=="string"||!/^Bearer [^\s]+$/.test(authHeader)) {
    res.status(401).json({ error: "Missing or invalid authorization token" });
    return;
  }

  const token = authHeader.split(" ")[1];
  try {
    const proof=SessionService.authenticate(token),user=proof.account;req.sessionProof=proof;

    req.user = {
      userId: user.id,
      email: user.email,
      roles: user.roles,
      activeWallet: user.activeWallet,
    };
    next();
  } catch (err) {
    const status=err instanceof SessionError?err.status:401;
    res.status(status).json({ error:status===503?"AUTH_SESSION_UNAVAILABLE":"AUTH_SESSION_INACTIVE" });
  }
}

export function requireRole(role: "seller" | "operator") {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if(role==='operator')res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    if (!req.user || !req.user.roles.includes(role)) {
      res.status(403).json({ error: `Forbidden: requires ${role} role` });
      return;
    }
    if(role==='operator'){
      res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      try{if(!req.sessionProof)throw new SessionError('AUTH_SESSION_INACTIVE');await operatorEnrollmentService.authorize(req.sessionProof);const auth=store.readAuthState(req.user.userId,req.sessionProof.key);SessionService.assertOperatorCommitted(req.sessionProof,auth);}
      catch(error){const known=error instanceof SessionError||error instanceof OperatorEnrollmentError;res.status(known?error.status:503).json({error:known?error.code:'OPERATOR_ACCESS_UNAVAILABLE'});return;}
    }
    next();
  };
}

/** Optional privilege on shared routes; ordinary party access survives missing/obsolete enrollment. */
export async function optionalOperator(req:AuthenticatedRequest,res:Response,next:NextFunction):Promise<void>{
 try{
  const proof=req.sessionProof;if(!proof)throw new SessionError('AUTH_SESSION_INACTIVE',401);
  if(req.user?.roles.includes('operator')){try{await operatorEnrollmentService.authorize(proof);}catch(error){if(!(error instanceof OperatorEnrollmentError))throw error;}}
  SessionService.assertCommitted(proof,store.readAuthState(proof.account.id,proof.key));next();
 }catch(error){res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.status(error instanceof SessionError?error.status:503).json({error:error instanceof SessionError?error.code:'OPERATOR_ACCESS_UNAVAILABLE'});}
}
