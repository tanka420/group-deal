import {OperationCompletionService} from './operationCompletionService';
import {OperationPreparationService} from './operationPreparationService';
import {OperationReadinessService} from './operationReadinessService';
import { ethers } from "ethers";
import crypto from "node:crypto";
import { store } from "../db/store";
import { config } from "../config";
import { computeTermsHash } from "../utils/crypto";
import type { TransactionOperation } from "../domain/operation";
import {OperationVerificationService} from "./operationVerificationService";
import {OperationTrackingService} from './operationTrackingService';
import {operationPublicDto} from '../domain/operationTracking';
import type {SessionProof} from "./sessionService";

import type {PreparedOperation} from '../domain/operationPreparation';
export class OperationService {
  public static prepare(input:PreparedOperation,proof?:SessionProof):TransactionOperation {return OperationPreparationService.direct(input,proof);}
  public static owned(userId:string,id:string):TransactionOperation {
    const operation=store.db.operations[id];
    if (!operation||operation.userId!==userId) throw new Error("FORBIDDEN: operation is not owned by this account");
    return operation;
  }
  public static submit(userId:string,id:string,txHash:string,proof?:SessionProof):TransactionOperation {return OperationTrackingService.submit(userId,id,txHash,proof);}
  public static publicOwned(userId:string,id:string,proof?:SessionProof){return OperationTrackingService.owned(userId,id,proof);}
  public static async ready(userId:string,id:string,proof?:SessionProof){return OperationReadinessService.ready(userId,id,proof);}
  public static async verify(userId:string,id:string,proof?:SessionProof) {return OperationVerificationService.verify(userId,id,proof);}
  public static projected(userId:string,id:string,proof?:SessionProof):void {OperationCompletionService.projected(userId,id,proof);}
  public static dto(operation:TransactionOperation) {return operationPublicDto(operation);}
}
